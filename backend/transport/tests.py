from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from .models import Bus, Route, Trip, TripSeat


User = get_user_model()


SIMPLE_LAYOUT = {
    "decks": [
        {
            "name": "LOWER",
            "rows": 2,
            "columns": 3,
            "aisle_after_columns": [1],
            "seats": [
                {"code": "A1", "row": 1, "column": 1},
                {"code": "A2", "row": 1, "column": 2},
                {"code": "B1", "row": 2, "column": 1},
            ],
        }
    ]
}


class TransportModelTests(TestCase):
    def setUp(self):
        self.operator = User.objects.create_user(
            username="operator_one",
            password="StrongPass123!",
            role=User.Role.OPERATOR,
        )
        self.bus = Bus.objects.create(
            operator=self.operator,
            name="Valley Express",
            plate_number="BA-01-TEST",
            bus_type="AC Deluxe",
            layout=SIMPLE_LAYOUT,
        )
        self.route = Route.objects.create(
            origin="Kathmandu",
            destination="Pokhara",
            distance=Decimal("200.00"),
            estimated_duration=timedelta(hours=7),
        )

    def test_creating_trip_generates_one_row_for_every_layout_seat(self):
        departure = timezone.now() + timedelta(days=1)
        trip = Trip.objects.create(
            bus=self.bus,
            route=self.route,
            departure_datetime=departure,
            arrival_datetime=departure + timedelta(hours=7),
            base_fare=Decimal("1200.00"),
        )

        self.assertEqual(trip.seats.count(), 3)
        self.assertEqual(
            set(trip.seats.values_list("seat_code", flat=True)),
            {"A1", "A2", "B1"},
        )
        self.assertFalse(
            trip.seats.exclude(status=TripSeat.Status.AVAILABLE).exists()
        )

    def test_layout_rejects_duplicate_seat_codes(self):
        invalid_layout = SIMPLE_LAYOUT | {
            "decks": [SIMPLE_LAYOUT["decks"][0] | {"seats": [
                {"code": "A1", "row": 1, "column": 1},
                {"code": "A1", "row": 1, "column": 2},
            ]}]
        }
        bus = Bus(
            operator=self.operator,
            name="Invalid Bus",
            plate_number="INVALID-1",
            bus_type="Standard",
            layout=invalid_layout,
        )

        with self.assertRaises(ValidationError):
            bus.full_clean()
