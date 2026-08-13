import secrets
import uuid
from decimal import Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q

from transport.models import Trip, TripSeat


def generate_booking_reference():
    return f"BT{secrets.token_hex(4).upper()}"


def generate_transaction_reference():
    """Kept only because the historical initial migration imports this helper."""
    return f"PAY{secrets.token_hex(6).upper()}"


class Booking(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        CONFIRMED = "CONFIRMED", "Confirmed"
        CANCELLED = "CANCELLED", "Cancelled"
        EXPIRED = "EXPIRED", "Expired"

    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="bookings",
    )
    trip = models.ForeignKey(Trip, on_delete=models.PROTECT, related_name="bookings")
    booking_reference = models.CharField(
        max_length=10,
        unique=True,
        default=generate_booking_reference,
        editable=False,
    )
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.PENDING,
    )
    total_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=Q(total_amount__gte=0),
                name="booking_total_non_negative",
            )
        ]

    def __str__(self):
        return self.booking_reference


class BookingSeat(models.Model):
    class Gender(models.TextChoices):
        MALE = "MALE", "Male"
        FEMALE = "FEMALE", "Female"
        OTHER = "OTHER", "Other"

    booking = models.ForeignKey(Booking, on_delete=models.CASCADE, related_name="seats")
    trip_seat = models.ForeignKey(
        TripSeat,
        on_delete=models.PROTECT,
        related_name="booking_records",
    )
    passenger_name = models.CharField(max_length=150, null=True, blank=True)
    age = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(120)],
    )
    gender = models.CharField(
        max_length=6,
        choices=Gender.choices,
        null=True,
        blank=True,
    )
    fare_charged = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.00"))],
    )

    class Meta:
        ordering = ["trip_seat_id"]
        constraints = [
            models.UniqueConstraint(
                fields=["booking", "trip_seat"],
                name="unique_seat_within_booking",
            ),
            # PostgreSQL enforces that only one active/charged booking can own a seat.
            models.UniqueConstraint(
                fields=["trip_seat"],
                condition=Q(fare_charged__isnull=False),
                name="unique_charged_booking_per_trip_seat",
            ),
            models.CheckConstraint(
                condition=Q(fare_charged__isnull=True) | Q(fare_charged__gte=0),
                name="booking_seat_fare_non_negative",
            ),
        ]

    def __str__(self):
        return f"{self.booking.booking_reference} / {self.trip_seat.seat_code}"


class Payment(models.Model):
    class Status(models.TextChoices):
        INITIATED = "INITIATED", "Initiated"
        PENDING = "PENDING", "Pending"
        PAID = "PAID", "Paid"
        FAILED = "FAILED", "Failed"

    booking = models.ForeignKey(Booking, on_delete=models.PROTECT, related_name="payments")
    transaction_uuid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    status = models.CharField(
        max_length=9,
        choices=Status.choices,
        default=Status.INITIATED,
    )
    gateway = models.CharField(max_length=20, default="esewa")
    raw_gateway_response = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    verified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(amount__gte=0),
                name="payment_amount_non_negative",
            ),
            models.UniqueConstraint(
                fields=["booking"],
                condition=Q(status="PAID"),
                name="one_paid_attempt_per_booking",
            ),
        ]

    def __str__(self):
        return str(self.transaction_uuid)
