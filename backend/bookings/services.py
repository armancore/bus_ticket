from datetime import timedelta
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.utils import timezone

from transport.models import Trip, TripSeat

from .models import Booking, BookingSeat, Payment


HOLD_DURATION = timedelta(minutes=10)


class SeatConflictError(Exception):
    def __init__(self, seat_codes):
        self.seat_codes = sorted(seat_codes)
        super().__init__("One or more seats are no longer available.")


class HoldExpiredError(Exception):
    pass


class BookingStateError(Exception):
    pass


class MockPaymentFailedError(Exception):
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

        held_until = now + HOLD_DURATION
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


def confirm_booking(*, customer, booking_reference, passengers, payment_success=True):
    passenger_by_code = {
        passenger["seat_code"].strip().upper(): passenger for passenger in passengers
    }
    expired = False
    payment_failed = False

    with transaction.atomic():
        booking, booking_records, seats = _lock_booking_and_seats(
            customer=customer,
            booking_reference=booking_reference,
        )
        if booking.status == Booking.Status.CONFIRMED:
            return booking
        if booking.status != Booking.Status.PENDING:
            raise BookingStateError(
                f"A {booking.status.lower()} booking cannot be confirmed."
            )

        expected_codes = {seat.seat_code for seat in seats}
        if set(passenger_by_code) != expected_codes:
            raise BookingStateError("Passenger details must match every held seat exactly.")

        now = timezone.now()
        invalid_hold = any(
            seat.status != TripSeat.Status.HELD
            or seat.held_by_id != customer.id
            or seat.held_until is None
            or seat.held_until <= now
            for seat in seats
        )
        if invalid_hold:
            _expire_locked_booking(booking, seats, customer.id)
            expired = True
        elif not payment_success:
            Payment.objects.create(
                booking=booking,
                amount=booking.total_amount,
                status=Payment.Status.FAILED,
            )
            payment_failed = True
        else:
            seat_by_id = {seat.id: seat for seat in seats}
            for record in booking_records:
                seat = seat_by_id[record.trip_seat_id]
                passenger = passenger_by_code[seat.seat_code]
                record.passenger_name = passenger["passenger_name"].strip()
                record.age = passenger["age"]
                record.gender = passenger["gender"]
                record.fare_charged = seat.effective_fare

            try:
                BookingSeat.objects.bulk_update(
                    booking_records,
                    ["passenger_name", "age", "gender", "fare_charged"],
                )
            except IntegrityError as error:
                raise BookingStateError("A selected seat was already booked.") from error

            for seat in seats:
                seat.status = TripSeat.Status.BOOKED
                seat.held_until = None
                seat.held_by = None
            TripSeat.objects.bulk_update(seats, ["status", "held_until", "held_by"])

            booking.total_amount = sum(
                (record.fare_charged for record in booking_records),
                Decimal("0.00"),
            )
            booking.status = Booking.Status.CONFIRMED
            booking.save(update_fields=["total_amount", "status"])
            Payment.objects.create(
                booking=booking,
                amount=booking.total_amount,
                status=Payment.Status.SUCCESS,
                paid_at=now,
            )

    if expired:
        raise HoldExpiredError("Your 10-minute seat hold has expired.")
    if payment_failed:
        raise MockPaymentFailedError("Mock payment failed. Your seats remain held.")
    return booking


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
    return booking


def expire_holds_for_trip(trip_id):
    now = timezone.now()
    with transaction.atomic():
        seats = list(
            TripSeat.objects.select_for_update()
            .filter(
                trip_id=trip_id,
                status=TripSeat.Status.HELD,
                held_until__lte=now,
            )
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
