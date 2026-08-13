import base64
import hashlib
import hmac
import json
from decimal import Decimal, InvalidOperation
from urllib.parse import urlencode

import requests
from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from transport.models import TripSeat

from .models import Booking, BookingSeat, Payment


SIGNED_FIELD_NAMES = "total_amount,transaction_uuid,product_code"


class EsewaPaymentError(Exception):
    pass


class EsewaVerificationError(EsewaPaymentError):
    pass


def format_amount(value):
    """Use one exact two-decimal string for both eSewa fields and HMAC input."""
    return f"{Decimal(value).quantize(Decimal('0.01')):.2f}"


def generate_signature(*, total_amount, transaction_uuid, product_code=None, secret=None):
    product_code = product_code or settings.ESEWA_PRODUCT_CODE
    secret = secret or settings.ESEWA_SECRET
    message = (
        f"total_amount={format_amount(total_amount)},"
        f"transaction_uuid={transaction_uuid},"
        f"product_code={product_code}"
    )
    digest = hmac.new(secret.encode(), message.encode(), hashlib.sha256).digest()
    return base64.b64encode(digest).decode()


def save_passenger_details(*, customer, booking_reference, passengers):
    passenger_by_code = {
        passenger["seat_code"].strip().upper(): passenger for passenger in passengers
    }
    with transaction.atomic():
        booking, records, seats = _lock_booking_by_reference(
            customer=customer,
            booking_reference=booking_reference,
        )
        _validate_pending_hold(booking, seats)
        if set(passenger_by_code) != {seat.seat_code for seat in seats}:
            raise EsewaPaymentError("Passenger details must match every held seat exactly.")
        seat_by_id = {seat.id: seat for seat in seats}
        for record in records:
            passenger = passenger_by_code[seat_by_id[record.trip_seat_id].seat_code]
            record.passenger_name = passenger["passenger_name"].strip()
            record.age = passenger["age"]
            record.gender = passenger["gender"]
        BookingSeat.objects.bulk_update(records, ["passenger_name", "age", "gender"])
    return booking


def initiate_esewa_payment(*, customer, booking_id):
    with transaction.atomic():
        booking, records, seats = _lock_booking_by_id(
            customer=customer,
            booking_id=booking_id,
        )
        _validate_pending_hold(booking, seats)
        if any(not record.passenger_name or record.age is None or not record.gender for record in records):
            raise EsewaPaymentError("Complete passenger details before payment.")

        # The browser never supplies a price; current seat fares are authoritative.
        total = _server_total(seats)
        booking.total_amount = total
        booking.save(update_fields=["total_amount"])
        payment = Payment.objects.create(
            booking=booking,
            amount=total,
            status=Payment.Status.INITIATED,
            gateway="esewa",
        )

    total_string = format_amount(total)
    transaction_uuid = str(payment.transaction_uuid)
    fields = {
        "amount": total_string,
        "tax_amount": "0.00",
        "total_amount": total_string,
        "transaction_uuid": transaction_uuid,
        "product_code": settings.ESEWA_PRODUCT_CODE,
        "product_service_charge": "0.00",
        "product_delivery_charge": "0.00",
        "success_url": settings.ESEWA_SUCCESS_URL,
        "failure_url": settings.ESEWA_FAILURE_URL,
        "signed_field_names": SIGNED_FIELD_NAMES,
        "signature": generate_signature(
            total_amount=total_string,
            transaction_uuid=transaction_uuid,
        ),
    }
    return payment, fields


def verify_esewa_payment(transaction_uuid):
    payment = Payment.objects.select_related("booking").get(
        transaction_uuid=transaction_uuid,
        gateway="esewa",
    )
    if payment.status == Payment.Status.PAID:
        return payment

    gateway_data = check_esewa_status(payment)
    gateway_status = str(gateway_data.get("status", "")).upper()

    verification_error = None
    settled_payment = payment
    with transaction.atomic():
        payment = Payment.objects.select_for_update().select_related("booking").get(pk=payment.pk)
        if payment.status == Payment.Status.PAID:
            return payment
        booking, records, seats = _lock_booking_by_id(
            customer=payment.booking.customer,
            booking_id=payment.booking_id,
        )
        total = _server_total(seats)
        payment.raw_gateway_response = gateway_data
        payment.verified_at = timezone.now()

        try:
            gateway_amount = Decimal(str(gateway_data.get("total_amount")))
        except (InvalidOperation, TypeError):
            gateway_amount = None
        amount_matches = (
            gateway_amount is not None
            and format_amount(gateway_amount) == format_amount(total)
            and format_amount(payment.amount) == format_amount(total)
        )

        if gateway_status != "COMPLETE" or not amount_matches:
            payment.status = (
                Payment.Status.PENDING if gateway_status in {"", "PENDING", "AMBIGUOUS"}
                else Payment.Status.FAILED
            )
            payment.save(update_fields=["status", "raw_gateway_response", "verified_at"])
            if gateway_status == "COMPLETE":
                verification_error = "eSewa amount did not match the server price."
            else:
                verification_error = f"eSewa payment is {gateway_status or 'unverified'}."
        else:
            settled_payment = _settle_locked_payment(payment, booking, records, seats, total)
    if verification_error:
        raise EsewaVerificationError(verification_error)
    return settled_payment


def _settle_locked_payment(payment, booking, records, seats, total):
    if booking.status == Booking.Status.CONFIRMED:
        paid_attempt = booking.payments.filter(status=Payment.Status.PAID).first()
        if paid_attempt:
            return paid_attempt
    if booking.status != Booking.Status.PENDING:
        raise EsewaVerificationError(f"A {booking.status.lower()} booking cannot be paid.")

    valid_ownership = all(
        seat.status == TripSeat.Status.HELD
        and seat.held_by_id == booking.customer_id
        for seat in seats
    )
    if not valid_ownership:
        raise EsewaVerificationError("The held seats are no longer available.")

    seat_by_id = {seat.id: seat for seat in seats}
    for record in records:
        record.fare_charged = seat_by_id[record.trip_seat_id].effective_fare
    try:
        BookingSeat.objects.bulk_update(records, ["fare_charged"])
    except IntegrityError as error:
        raise EsewaVerificationError("A selected seat was already sold.") from error

    for seat in seats:
        seat.status = TripSeat.Status.BOOKED
        seat.held_until = None
        seat.held_by = None
    TripSeat.objects.bulk_update(seats, ["status", "held_until", "held_by"])

    booking.total_amount = total
    booking.status = Booking.Status.CONFIRMED
    booking.save(update_fields=["total_amount", "status"])
    payment.amount = total
    payment.status = Payment.Status.PAID
    payment.save(update_fields=["amount", "status", "raw_gateway_response", "verified_at"])
    return payment


def check_esewa_status(payment):
    # Verification is server-to-server; the browser redirect is never proof of payment.
    response = requests.get(
        settings.ESEWA_STATUS_URL,
        params={
            "product_code": settings.ESEWA_PRODUCT_CODE,
            "total_amount": format_amount(payment.amount),
            "transaction_uuid": str(payment.transaction_uuid),
        },
        timeout=10,
    )
    response.raise_for_status()
    return response.json()


def decode_callback_data(encoded_data):
    try:
        padded = encoded_data + "=" * (-len(encoded_data) % 4)
        return json.loads(base64.b64decode(padded).decode())
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise EsewaPaymentError("Invalid eSewa callback data.") from error


def fail_esewa_payment(transaction_uuid):
    with transaction.atomic():
        payment = Payment.objects.select_for_update().select_related("booking").get(
            transaction_uuid=transaction_uuid,
            gateway="esewa",
        )
        if payment.status == Payment.Status.PAID:
            return payment
        booking, _records, seats = _lock_booking_by_id(
            customer=payment.booking.customer,
            booking_id=payment.booking_id,
        )
        for seat in seats:
            if seat.status == TripSeat.Status.HELD and seat.held_by_id == booking.customer_id:
                seat.status = TripSeat.Status.AVAILABLE
                seat.held_until = None
                seat.held_by = None
        TripSeat.objects.bulk_update(seats, ["status", "held_until", "held_by"])
        if booking.status == Booking.Status.PENDING:
            booking.status = Booking.Status.CANCELLED
            booking.save(update_fields=["status"])
        payment.status = Payment.Status.FAILED
        payment.verified_at = timezone.now()
        payment.save(update_fields=["status", "verified_at"])
    return payment


def frontend_redirect(path, **params):
    base = settings.FRONTEND_BASE_URL.rstrip("/")
    return f"{base}{path}?{urlencode(params)}"


def _server_total(seats):
    return sum((seat.effective_fare for seat in seats), Decimal("0.00"))


def _validate_pending_hold(booking, seats):
    now = timezone.now()
    if booking.status != Booking.Status.PENDING:
        raise EsewaPaymentError(f"A {booking.status.lower()} booking cannot be paid.")
    invalid = any(
        seat.status != TripSeat.Status.HELD
        or seat.held_by_id != booking.customer_id
        or seat.held_until is None
        or seat.held_until <= now
        for seat in seats
    )
    if invalid:
        raise EsewaPaymentError("The seat hold has expired or is no longer available.")


def _lock_booking_by_reference(*, customer, booking_reference):
    booking_id = Booking.objects.only("id").get(
        booking_reference=booking_reference,
        customer=customer,
    ).id
    return _lock_booking_by_id(customer=customer, booking_id=booking_id)


def _lock_booking_by_id(*, customer, booking_id):
    booking = Booking.objects.select_related("trip").get(pk=booking_id, customer=customer)
    seat_ids = list(
        BookingSeat.objects.filter(booking_id=booking_id)
        .order_by("trip_seat_id")
        .values_list("trip_seat_id", flat=True)
    )
    # Lock seats in one stable order so concurrent multi-seat operations cannot deadlock.
    seats = list(
        TripSeat.objects.select_for_update().filter(pk__in=seat_ids).order_by("pk")
    )
    booking = Booking.objects.select_for_update().select_related("trip").get(
        pk=booking_id,
        customer=customer,
    )
    records = list(BookingSeat.objects.filter(booking=booking).order_by("trip_seat_id"))
    return booking, records, seats
