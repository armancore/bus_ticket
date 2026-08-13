from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from transport.models import Trip, TripSeat

from .models import Booking, BookingSeat, Payment


class SeatConflictError(Exception):
    def __init__(self, seat_codes):
        self.seat_codes = sorted(seat_codes)
        super().__init__("One or more seats are no longer available.")


class BookingStateError(Exception):
    pass


def hold_seats(*, customer, trip_id, seat_codes):
    normalized_codes = sorted({code.strip().upper() for code in seat_codes})
    now = timezone.now()

    with transaction.atomic():
        trip = Trip.objects.get(pk=trip_id)
        if trip.status != Trip.Status.SCHEDULED or trip.departure_datetime <= now:
            raise BookingStateError("This trip is not open for booking.")

        # The explicit ordering gives simultaneous multi-seat requests one lock order.
        seats = list(
            TripSeat.objects.select_for_update()
            .filter(trip=trip, seat_code__in=normalized_codes)
            .order_by("pk")
        )
        found_codes = {seat.seat_code for seat in seats}
        conflicts = set(normalized_codes) - found_codes
        conflicts.update(
            seat.seat_code
            for seat in seats
            if not (
                seat.status == TripSeat.Status.AVAILABLE
                or (
                    seat.status == TripSeat.Status.HELD
                    and seat.held_until is not None
                    and seat.held_until <= now
                )
            )
        )
        if conflicts:
            raise SeatConflictError(conflicts)

        expired_seat_ids = [
            seat.id
            for seat in seats
            if seat.status == TripSeat.Status.HELD and seat.held_until <= now
        ]
        if expired_seat_ids:
            expired_booking_ids = BookingSeat.objects.filter(
                trip_seat_id__in=expired_seat_ids,
                booking__status=Booking.Status.PENDING,
            ).values_list("booking_id", flat=True)
            Booking.objects.filter(id__in=expired_booking_ids).update(
                status=Booking.Status.EXPIRED
            )

        held_until = now + timedelta(minutes=settings.BOOKING_HOLD_MINUTES)
        total_amount = sum((seat.effective_fare for seat in seats), Decimal("0.00"))
        booking = Booking.objects.create(
            customer=customer,
            trip=trip,
            total_amount=total_amount,
        )
        for seat in seats:
            seat.status = TripSeat.Status.HELD
            seat.held_until = held_until
            seat.held_by = customer
        TripSeat.objects.bulk_update(seats, ["status", "held_until", "held_by"])
        BookingSeat.objects.bulk_create(
            [BookingSeat(booking=booking, trip_seat=seat) for seat in seats]
        )

    return booking, held_until


def cancel_booking(*, customer, booking_reference):
    with transaction.atomic():
        booking, booking_records, seats = _lock_booking_and_seats(
            customer=customer,
            booking_reference=booking_reference,
        )
        if booking.status in {Booking.Status.CANCELLED, Booking.Status.EXPIRED}:
            return booking
        if booking.trip.departure_datetime <= timezone.now():
            raise BookingStateError("A departed trip cannot be cancelled.")

        for seat in seats:
            owns_pending_hold = (
                booking.status == Booking.Status.PENDING
                and seat.status == TripSeat.Status.HELD
                and seat.held_by_id == customer.id
            )
            owns_confirmed_seat = (
                booking.status == Booking.Status.CONFIRMED
                and seat.status == TripSeat.Status.BOOKED
            )
            if owns_pending_hold or owns_confirmed_seat:
                seat.status = TripSeat.Status.AVAILABLE
                seat.held_until = None
                seat.held_by = None
        TripSeat.objects.bulk_update(seats, ["status", "held_until", "held_by"])

        for record in booking_records:
            record.fare_charged = None
        BookingSeat.objects.bulk_update(booking_records, ["fare_charged"])
        booking.status = Booking.Status.CANCELLED
        booking.save(update_fields=["status"])
        booking.payments.filter(
            status__in=[Payment.Status.INITIATED, Payment.Status.PENDING]
        ).update(status=Payment.Status.FAILED, verified_at=timezone.now())
    return booking


def confirm_counter_booking(*, customer, booking_reference):
    """Confirm held seats while leaving payment due at the bus counter."""
    with transaction.atomic():
        booking, records, seats = _lock_booking_and_seats(
            customer=customer,
            booking_reference=booking_reference,
        )
        existing_payment = booking.payments.filter(gateway="counter").first()
        if booking.status == Booking.Status.CONFIRMED and existing_payment:
            return booking
        if booking.status != Booking.Status.PENDING:
            raise BookingStateError(
                f"A {booking.status.lower()} booking cannot be confirmed."
            )

        now = timezone.now()
        valid_hold = all(
            seat.status == TripSeat.Status.HELD
            and seat.held_by_id == customer.id
            and seat.held_until is not None
            and seat.held_until > now
            for seat in seats
        )
        if not valid_hold:
            raise BookingStateError("The seat hold has expired or is no longer available.")
        if any(
            not record.passenger_name or record.age is None or not record.gender
            for record in records
        ):
            raise BookingStateError("Complete passenger details before booking.")

        seat_by_id = {seat.id: seat for seat in seats}
        total = sum((seat.effective_fare for seat in seats), Decimal("0.00"))
        for record in records:
            record.fare_charged = seat_by_id[record.trip_seat_id].effective_fare
        try:
            BookingSeat.objects.bulk_update(records, ["fare_charged"])
        except IntegrityError as error:
            raise BookingStateError("A selected seat was already booked.") from error

        for seat in seats:
            seat.status = TripSeat.Status.BOOKED
            seat.held_until = None
            seat.held_by = None
        TripSeat.objects.bulk_update(seats, ["status", "held_until", "held_by"])

        booking.total_amount = total
        booking.status = Booking.Status.CONFIRMED
        booking.save(update_fields=["total_amount", "status"])
        booking.payments.filter(
            gateway="esewa",
            status__in=[Payment.Status.INITIATED, Payment.Status.PENDING],
        ).update(status=Payment.Status.FAILED, verified_at=timezone.now())
        Payment.objects.create(
            booking=booking,
            amount=total,
            status=Payment.Status.PENDING,
            gateway="counter",
            raw_gateway_response={"note": "Payment due at the bus counter."},
        )
    return booking


def expire_holds_for_trip(trip_id):
    now = timezone.now()
    with transaction.atomic():
        seats = list(
            TripSeat.objects.select_for_update()
            .expired_holds(at=now)
            .filter(trip_id=trip_id)
            .order_by("pk")
        )
        if not seats:
            return 0

        booking_ids = BookingSeat.objects.filter(
            trip_seat_id__in=[seat.id for seat in seats],
            booking__status=Booking.Status.PENDING,
        ).values_list("booking_id", flat=True)
        Booking.objects.filter(id__in=booking_ids).update(status=Booking.Status.EXPIRED)
        for seat in seats:
            seat.status = TripSeat.Status.AVAILABLE
            seat.held_until = None
            seat.held_by = None
        TripSeat.objects.bulk_update(seats, ["status", "held_until", "held_by"])
    return len(seats)


def expire_all_holds():
    trip_ids = list(
        TripSeat.objects.expired_holds()
        .order_by()
        .values_list("trip_id", flat=True)
        .distinct()
    )
    return sum(expire_holds_for_trip(trip_id) for trip_id in trip_ids)


def expire_booking_if_needed(*, customer, booking_reference):
    with transaction.atomic():
        booking, _records, seats = _lock_booking_and_seats(
            customer=customer,
            booking_reference=booking_reference,
        )
        if booking.status != Booking.Status.PENDING:
            return booking
        now = timezone.now()
        if any(seat.held_until is None or seat.held_until <= now for seat in seats):
            _expire_locked_booking(booking, seats, customer.id)
    return booking


def _lock_booking_and_seats(*, customer, booking_reference):
    booking_snapshot = Booking.objects.select_related("trip").get(
        booking_reference=booking_reference,
        customer=customer,
    )
    seat_ids = list(
        BookingSeat.objects.filter(booking=booking_snapshot)
        .order_by("trip_seat_id")
        .values_list("trip_seat_id", flat=True)
    )
    seats = list(
        TripSeat.objects.select_for_update().filter(id__in=seat_ids).order_by("pk")
    )
    booking = (
        Booking.objects.select_for_update()
        .select_related("trip")
        .get(pk=booking_snapshot.pk)
    )
    booking_records = list(
        BookingSeat.objects.filter(booking=booking).order_by("trip_seat_id")
    )
    return booking, booking_records, seats


def _expire_locked_booking(booking, seats, customer_id):
    for seat in seats:
        if seat.status == TripSeat.Status.HELD and seat.held_by_id == customer_id:
            seat.status = TripSeat.Status.AVAILABLE
            seat.held_until = None
            seat.held_by = None
    TripSeat.objects.bulk_update(seats, ["status", "held_until", "held_by"])
    booking.status = Booking.Status.EXPIRED
    booking.save(update_fields=["status"])
