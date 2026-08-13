from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

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


class PublicTripAPITests(APITestCase):
    def setUp(self):
        operator = User.objects.create_user(
            username="api_operator",
            password="StrongPass123!",
            role=User.Role.OPERATOR,
        )
        bus = Bus.objects.create(
            operator=operator,
            name="API Express",
            plate_number="BA-API-1",
            bus_type="AC Deluxe",
            layout=SIMPLE_LAYOUT,
        )
        kathmandu_to_pokhara = Route.objects.create(
            origin="Kathmandu",
            destination="Pokhara",
            distance=Decimal("200.00"),
            estimated_duration=timedelta(hours=7),
        )
        kathmandu_to_chitwan = Route.objects.create(
            origin="Kathmandu",
            destination="Chitwan",
            distance=Decimal("150.00"),
            estimated_duration=timedelta(hours=5),
        )
        departure = timezone.now() + timedelta(days=2)
        self.trip = Trip.objects.create(
            bus=bus,
            route=kathmandu_to_pokhara,
            departure_datetime=departure,
            arrival_datetime=departure + timedelta(hours=7),
            base_fare=Decimal("1200.00"),
        )
        Trip.objects.create(
            bus=bus,
            route=kathmandu_to_chitwan,
            departure_datetime=departure,
            arrival_datetime=departure + timedelta(hours=5),
            base_fare=Decimal("900.00"),
        )

    def test_anonymous_user_can_list_routes(self):
        response = self.client.get(reverse("route-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

    def test_trip_search_filters_origin_destination_and_date(self):
        local_date = timezone.localtime(self.trip.departure_datetime).date().isoformat()
        response = self.client.get(
            reverse("trip-list"),
            {
                "origin": "Kathmandu",
                "destination": "Pokhara",
                "date": local_date,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], self.trip.id)

    def test_cancelled_trip_is_not_returned_in_search(self):
        self.trip.status = Trip.Status.CANCELLED
        self.trip.save(update_fields=["status"])

        response = self.client.get(reverse("trip-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

    def test_anonymous_user_can_view_trip_detail(self):
        response = self.client.get(reverse("trip-detail", args=[self.trip.id]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["bus"]["name"], "API Express")
        self.assertIn("bus_layout", response.data)

    def test_anonymous_user_can_view_seat_map_without_hold_owner_data(self):
        held_seat = self.trip.seats.get(seat_code="A1")
        held_seat.status = TripSeat.Status.HELD
        held_seat.held_by = operator = User.objects.create_user(
            username="seat_holder",
            password="StrongPass123!",
        )
        held_seat.held_until = timezone.now() + timedelta(minutes=10)
        held_seat.save(update_fields=["status", "held_by", "held_until"])

        response = self.client.get(reverse("trip-seat-map", args=[self.trip.id]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["layout"], SIMPLE_LAYOUT)
        self.assertEqual(len(response.data["seats"]), 3)
        serialized_held_seat = next(
            seat for seat in response.data["seats"] if seat["seat_code"] == "A1"
        )
        self.assertEqual(serialized_held_seat["status"], TripSeat.Status.HELD)
        self.assertEqual(serialized_held_seat["effective_fare"], "1200.00")
        self.assertNotIn("held_by", serialized_held_seat)
        self.assertNotContains(response, operator.username)


class OperatorPermissionAPITests(APITestCase):
    def setUp(self):
        self.operator = User.objects.create_user(
            username="manifest_operator",
            password="StrongPass123!",
            role=User.Role.OPERATOR,
        )
        self.other_operator = User.objects.create_user(
            username="other_manifest_operator",
            password="StrongPass123!",
            role=User.Role.OPERATOR,
        )
        self.route = Route.objects.create(
            origin="Kathmandu",
            destination="Pokhara",
            distance=Decimal("200.00"),
            estimated_duration=timedelta(hours=7),
        )
        departure = timezone.now() + timedelta(days=2)
        self.own_bus = Bus.objects.create(
            operator=self.operator,
            name="Owned Bus",
            plate_number="OWNED-1",
            bus_type="AC",
            layout=SIMPLE_LAYOUT,
        )
        self.other_bus = Bus.objects.create(
            operator=self.other_operator,
            name="Other Bus",
            plate_number="OTHER-1",
            bus_type="AC",
            layout=SIMPLE_LAYOUT,
        )
        self.own_trip = Trip.objects.create(
            bus=self.own_bus,
            route=self.route,
            departure_datetime=departure,
            arrival_datetime=departure + timedelta(hours=7),
            base_fare=Decimal("1000.00"),
        )
        self.other_trip = Trip.objects.create(
            bus=self.other_bus,
            route=self.route,
            departure_datetime=departure,
            arrival_datetime=departure + timedelta(hours=7),
            base_fare=Decimal("1000.00"),
        )
        self.client.force_authenticate(self.operator)

    def test_operator_trip_list_contains_only_owned_trips(self):
        response = self.client.get(reverse("operator-trip-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([trip["id"] for trip in response.data], [self.own_trip.id])

    def test_operator_cannot_access_another_operators_manifest(self):
        response = self.client.get(
            reverse("operator-trip-manifest", args=[self.other_trip.id])
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_operator_can_create_bus_and_is_automatically_the_owner(self):
        response = self.client.post(
            reverse("operator-bus-list"),
            {
                "name": "New Express",
                "plate_number": "NEW-OP-1",
                "bus_type": "Deluxe",
                "layout": SIMPLE_LAYOUT,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        bus = Bus.objects.get(plate_number="NEW-OP-1")
        self.assertEqual(bus.operator, self.operator)
        self.assertEqual(response.data["seat_count"], 3)

    def test_operator_can_create_two_by_two_bus_from_seat_count(self):
        response = self.client.post(
            reverse("operator-bus-list"),
            {
                "name": "Forty Seat Express",
                "plate_number": "NEW-OP-40",
                "bus_type": "Deluxe",
                "seat_count": 40,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        bus = Bus.objects.get(plate_number="NEW-OP-40")
        deck = bus.layout["decks"][0]
        self.assertEqual(response.data["seat_count"], 40)
        self.assertEqual(deck["rows"], 10)
        self.assertEqual(deck["columns"], 4)
        self.assertEqual(deck["aisle_after_columns"], [2])
        self.assertEqual(
            [(seat["row"], seat["column"]) for seat in deck["seats"][:4]],
            [(1, 1), (1, 2), (1, 3), (1, 4)],
        )

    def test_operator_bus_seat_count_must_make_complete_two_by_two_rows(self):
        response = self.client.post(
            reverse("operator-bus-list"),
            {
                "name": "Invalid Seat Bus",
                "plate_number": "INVALID-SEATS",
                "bus_type": "Deluxe",
                "seat_count": 42,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("seat_count", response.data)

    def test_operator_cannot_read_update_or_delete_another_operators_bus(self):
        url = reverse("operator-bus-detail", args=[self.other_bus.id])

        self.assertEqual(self.client.get(url).status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(
            self.client.patch(url, {"name": "Stolen"}).status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.assertEqual(self.client.delete(url).status_code, status.HTTP_404_NOT_FOUND)

    def test_operator_can_create_trip_only_for_an_owned_bus(self):
        departure = timezone.now() + timedelta(days=5)
        payload = {
            "bus_id": self.own_bus.id,
            "route_id": self.route.id,
            "departure_datetime": departure.isoformat(),
            "arrival_datetime": (departure + timedelta(hours=7)).isoformat(),
            "base_fare": "1500.00",
            "status": Trip.Status.SCHEDULED,
        }

        response = self.client.post(reverse("operator-trip-list"), payload)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["bus"]["id"], self.own_bus.id)
        self.assertEqual(Trip.objects.get(id=response.data["id"]).seats.count(), 3)

        payload["bus_id"] = self.other_bus.id
        forbidden_response = self.client.post(reverse("operator-trip-list"), payload)
        self.assertEqual(forbidden_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("bus_id", forbidden_response.data)

    def test_operator_cannot_update_or_delete_another_operators_trip(self):
        url = reverse("operator-trip-detail", args=[self.other_trip.id])

        self.assertEqual(
            self.client.patch(url, {"status": Trip.Status.CANCELLED}).status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.assertEqual(self.client.delete(url).status_code, status.HTTP_404_NOT_FOUND)

    def test_operator_can_update_owned_trip_but_cannot_change_its_bus(self):
        url = reverse("operator-trip-detail", args=[self.own_trip.id])

        response = self.client.patch(url, {"status": Trip.Status.CANCELLED})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], Trip.Status.CANCELLED)

        other_owned_bus = Bus.objects.create(
            operator=self.operator,
            name="Second Owned Bus",
            plate_number="OWNED-2",
            bus_type="AC",
            layout=SIMPLE_LAYOUT,
        )
        response = self.client.patch(url, {"bus_id": other_owned_bus.id})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("bus_id", response.data)

    def test_customer_cannot_access_operator_management(self):
        customer = User.objects.create_user(
            username="not_an_operator",
            password="StrongPass123!",
            role=User.Role.CUSTOMER,
        )
        self.client.force_authenticate(customer)

        self.assertEqual(
            self.client.get(reverse("operator-bus-list")).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.get(reverse("operator-trip-list")).status_code,
            status.HTTP_403_FORBIDDEN,
        )
