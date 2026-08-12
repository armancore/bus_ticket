from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models, transaction
from django.db.models import Q


def validate_bus_layout(layout):
    """Validate the data React needs to draw any bus without hard-coded layouts."""
    if not isinstance(layout, dict) or not isinstance(layout.get("decks"), list):
        raise ValidationError("Layout must contain a 'decks' list.")
    if not layout["decks"]:
        raise ValidationError("Layout must contain at least one deck.")

    all_codes = []
    for deck in layout["decks"]:
        required = {"name", "rows", "columns", "aisle_after_columns", "seats"}
        if not isinstance(deck, dict) or not required.issubset(deck):
            raise ValidationError(
                "Each deck needs name, rows, columns, aisle_after_columns, and seats."
            )
        if not isinstance(deck["seats"], list):
            raise ValidationError("Each deck's seats value must be a list.")

        for seat in deck["seats"]:
            if not isinstance(seat, dict) or not {"code", "row", "column"}.issubset(seat):
                raise ValidationError("Every seat needs a code, row, and column.")
            all_codes.append(str(seat["code"]).strip().upper())

    if not all_codes or any(not code for code in all_codes):
        raise ValidationError("A layout must contain seats with non-empty codes.")
    if len(all_codes) != len(set(all_codes)):
        raise ValidationError("Seat codes must be unique across the whole bus.")


class Bus(models.Model):
    operator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="buses",
    )
    name = models.CharField(max_length=120)
    plate_number = models.CharField(max_length=30, unique=True)
    bus_type = models.CharField(max_length=60)
    layout = models.JSONField(validators=[validate_bus_layout])

    class Meta:
        ordering = ["name", "plate_number"]
        verbose_name_plural = "buses"

    @property
    def seat_codes(self):
        validate_bus_layout(self.layout)
        return [
            str(seat["code"]).strip().upper()
            for deck in self.layout["decks"]
            for seat in deck["seats"]
        ]

    def clean(self):
        super().clean()
        if self.operator_id and self.operator.role != self.operator.Role.OPERATOR:
            raise ValidationError({"operator": "A bus owner must have the OPERATOR role."})

    def __str__(self):
        return f"{self.name} ({self.plate_number})"


class Route(models.Model):
    origin = models.CharField(max_length=120)
    destination = models.CharField(max_length=120)
    distance = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
        help_text="Distance in kilometres.",
    )
    estimated_duration = models.DurationField()

    class Meta:
        ordering = ["origin", "destination"]

    def clean(self):
        super().clean()
        if self.origin.strip().casefold() == self.destination.strip().casefold():
            raise ValidationError("Origin and destination must be different.")

    def __str__(self):
        return f"{self.origin} → {self.destination}"


class Trip(models.Model):
    class Status(models.TextChoices):
        SCHEDULED = "SCHEDULED", "Scheduled"
        DEPARTED = "DEPARTED", "Departed"
        CANCELLED = "CANCELLED", "Cancelled"

    bus = models.ForeignKey(Bus, on_delete=models.PROTECT, related_name="trips")
    route = models.ForeignKey(Route, on_delete=models.PROTECT, related_name="trips")
    departure_datetime = models.DateTimeField()
    arrival_datetime = models.DateTimeField()
    base_fare = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.SCHEDULED,
    )

    class Meta:
        ordering = ["departure_datetime"]
        constraints = [
            models.CheckConstraint(
                condition=Q(arrival_datetime__gt=models.F("departure_datetime")),
                name="trip_arrival_after_departure",
            ),
            models.CheckConstraint(
                condition=Q(base_fare__gte=0),
                name="trip_base_fare_non_negative",
            ),
        ]

    def save(self, *args, **kwargs):
        is_new = self._state.adding
        # One transaction means a new trip and its seat inventory appear together.
        with transaction.atomic():
            super().save(*args, **kwargs)
            if is_new:
                TripSeat.objects.bulk_create(
                    [TripSeat(trip=self, seat_code=code) for code in self.bus.seat_codes]
                )

    def __str__(self):
        return f"{self.route} — {self.departure_datetime:%Y-%m-%d %H:%M}"


class TripSeat(models.Model):
    class Status(models.TextChoices):
        AVAILABLE = "AVAILABLE", "Available"
        HELD = "HELD", "Held"
        BOOKED = "BOOKED", "Booked"

    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="seats")
    seat_code = models.CharField(max_length=20)
    status = models.CharField(
        max_length=9,
        choices=Status.choices,
        default=Status.AVAILABLE,
    )
    held_until = models.DateTimeField(null=True, blank=True)
    held_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="held_trip_seats",
    )
    price_override = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.00"))],
    )

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(
                fields=["trip", "seat_code"],
                name="unique_seat_code_per_trip",
            ),
            models.CheckConstraint(
                condition=Q(price_override__isnull=True) | Q(price_override__gte=0),
                name="trip_seat_price_override_non_negative",
            ),
        ]

    def __str__(self):
        return f"{self.trip_id} / {self.seat_code}"
