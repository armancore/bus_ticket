import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import IntegrityError, close_old_connections, transaction
from django.test import TransactionTestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from transport.models import Bus, Route, Trip, TripSeat

from .models import Booking, BookingSeat, Payment
from .services import SeatConflictError, hold_seats


User = get_user_model()

TEST_LAYOUT = {
    "decks": [
        {
            "name": "LOWER",
            "rows": 1,
            "columns": 2,
            "aisle_after_columns": [1],
            "seats": [
                {"code": "A1", "row": 1, "column": 1},
                {"code": "A2", "row": 1, "column": 2},
            ],
        }
    ]
}


def create_trip(operator, plate_number="BA-BOOKING-1"):
    bus = Bus.objects.create(
        operator=operator,
        name="Booking Test Express",
        plate_number=plate_number,
        bus_type="AC",
        layout=TEST_LAYOUT,
    )
    route = Route.objects.create(
        origin="Kathmandu",
        destination="Pokhara",
        distance=Decimal("200.00"),
        estimated_duration=timedelta(hours=7),
    )
    departure = timezone.now() + timedelta(days=2)
    return Trip.objects.create(
        bus=bus,
        route=route,
        departure_datetime=departure,
        arrival_datetime=departure + timedelta(hours=7),
        base_fare=Decimal("1200.00"),
    )


class BookingFlowAPITests(APITestCase):
    def setUp(self):
        self.customer = User.objects.create_user(
            username="booking_customer",
            password="StrongPass123!",
        )
        self.other_customer = User.objects.create_user(
            username="other_customer",
            password="StrongPass123!",
        )
        self.operator = User.objects.create_user(
            username="booking_operator",
            password="StrongPass123!",
            role=User.Role.OPERATOR,
        )
        self.trip = create_trip(self.operator)
        self.client.force_authenticate(self.customer)

    def hold(self, seat_codes=None):
        return self.client.post(
            reverse("hold-seats"),
            {"trip_id": self.trip.id, "seat_codes": seat_codes or ["A1"]},
            format="json",
        )

    def test_customer_can_hold_and_confirm_seat_with_mock_payment(self):
        hold_response = self.hold()

        self.assertEqual(hold_response.status_code, status.HTTP_201_CREATED)
        reference = hold_response.data["booking_reference"]
        seat = self.trip.seats.get(seat_code="A1")
        self.assertEqual(seat.status, TripSeat.Status.HELD)
        self.assertEqual(seat.held_by, self.customer)

        confirm_response = self.client.post(
            reverse("confirm-booking", args=[reference]),
            {
                "passengers": [
                    {
                        "seat_code": "A1",
                        "passenger_name": "Demo Passenger",
                        "age": 24,
                        "gender": "OTHER",
                    }
                ],
                "simulate_payment_success": True,
            },
            format="json",
        )

        self.assertEqual(confirm_response.status_code, status.HTTP_200_OK)
        seat.refresh_from_db()
        booking = Booking.objects.get(booking_reference=reference)
        self.assertEqual(seat.status, TripSeat.Status.BOOKED)
        self.assertIsNone(seat.held_by)
        self.assertEqual(booking.status, Booking.Status.CONFIRMED)
        self.assertEqual(booking.seats.get().fare_charged, Decimal("1200.00"))
        self.assertEqual(booking.payments.get().status, Payment.Status.SUCCESS)

        retry_response = self.client.post(
            reverse("confirm-booking", args=[reference]),
            {
                "passengers": [
                    {
                        "seat_code": "A1",
                        "passenger_name": "Demo Passenger",
                        "age": 24,
                        "gender": "OTHER",
                    }
                ],
                "simulate_payment_success": True,
            },
            format="json",
        )
        self.assertEqual(retry_response.status_code, status.HTTP_200_OK)
        self.assertEqual(booking.payments.count(), 1)

    def test_expired_hold_is_released_lazily_for_another_customer(self):
        first_hold = self.hold()
        first_booking = Booking.objects.get(
            booking_reference=first_hold.data["booking_reference"]
        )
        self.trip.seats.filter(seat_code="A1").update(
            held_until=timezone.now() - timedelta(seconds=1)
        )

        self.client.force_authenticate(self.other_customer)
        second_hold = self.hold()

        self.assertEqual(second_hold.status_code, status.HTTP_201_CREATED)
        first_booking.refresh_from_db()
        seat = self.trip.seats.get(seat_code="A1")
        self.assertEqual(first_booking.status, Booking.Status.EXPIRED)
        self.assertEqual(seat.held_by, self.other_customer)

    def test_active_hold_returns_conflicting_seat_codes(self):
        self.hold(["A1"])
        self.client.force_authenticate(self.other_customer)

        response = self.hold(["A1", "A2"])

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["conflicting_seats"], ["A1"])
        self.assertEqual(self.trip.seats.get(seat_code="A2").status, TripSeat.Status.AVAILABLE)

    def test_operator_cannot_hold_seats(self):
        self.client.force_authenticate(self.operator)

        response = self.hold()

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_customer_cannot_view_another_customers_booking(self):
        response = self.hold()
        reference = response.data["booking_reference"]
        self.client.force_authenticate(self.other_customer)

        detail_response = self.client.get(reverse("booking-detail", args=[reference]))

        self.assertEqual(detail_response.status_code, status.HTTP_404_NOT_FOUND)

    def test_cancelled_pending_booking_releases_held_seat(self):
        response = self.hold()
        reference = response.data["booking_reference"]

        cancel_response = self.client.post(reverse("cancel-booking", args=[reference]))

        self.assertEqual(cancel_response.status_code, status.HTTP_200_OK)
        self.assertEqual(cancel_response.data["status"], Booking.Status.CANCELLED)
        self.assertEqual(self.trip.seats.get(seat_code="A1").status, TripSeat.Status.AVAILABLE)

    def test_failed_mock_payment_keeps_seat_held_for_retry(self):
        response = self.hold()
        reference = response.data["booking_reference"]

        payment_response = self.client.post(
            reverse("confirm-booking", args=[reference]),
            {
                "passengers": [
                    {
                        "seat_code": "A1",
                        "passenger_name": "Demo Passenger",
                        "age": 24,
                        "gender": "OTHER",
                    }
                ],
                "simulate_payment_success": False,
            },
            format="json",
        )

        self.assertEqual(payment_response.status_code, status.HTTP_402_PAYMENT_REQUIRED)
        booking = Booking.objects.get(booking_reference=reference)
        self.assertEqual(booking.status, Booking.Status.PENDING)
        self.assertEqual(self.trip.seats.get(seat_code="A1").status, TripSeat.Status.HELD)
        self.assertEqual(booking.payments.get().status, Payment.Status.FAILED)

    def test_database_rejects_second_charged_record_for_same_trip_seat(self):
        first_hold = self.hold()
        first_booking = Booking.objects.get(
            booking_reference=first_hold.data["booking_reference"]
        )
        first_record = first_booking.seats.get()
        first_record.fare_charged = Decimal("1200.00")
        first_record.save(update_fields=["fare_charged"])
        second_booking = Booking.objects.create(
            customer=self.other_customer,
            trip=self.trip,
            total_amount=Decimal("1200.00"),
        )

        with self.assertRaises(IntegrityError), transaction.atomic():
            BookingSeat.objects.create(
                booking=second_booking,
                trip_seat=first_record.trip_seat,
                fare_charged=Decimal("1200.00"),
            )

    def test_only_admin_can_view_all_bookings_and_summary(self):
        self.hold()
        customer_response = self.client.get(reverse("admin-booking-list"))
        self.assertEqual(customer_response.status_code, status.HTTP_403_FORBIDDEN)

        admin = User.objects.create_user(
            username="dashboard_admin",
            password="StrongPass123!",
            role=User.Role.ADMIN,
        )
        self.client.force_authenticate(admin)
        bookings_response = self.client.get(reverse("admin-booking-list"))
        summary_response = self.client.get(reverse("admin-summary"))

        self.assertEqual(bookings_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(bookings_response.data), 1)
        self.assertEqual(summary_response.status_code, status.HTTP_200_OK)
        self.assertEqual(summary_response.data["total_bookings"], 1)


class SeatHoldConcurrencyTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        operator = User.objects.create_user(
            username="thread_operator",
            password="StrongPass123!",
            role=User.Role.OPERATOR,
        )
        self.customers = [
            User.objects.create_user(username=f"thread_customer_{index}", password="StrongPass123!")
            for index in range(2)
        ]
        self.trip = create_trip(operator, plate_number="BA-THREAD-1")

    def test_exactly_one_simultaneous_hold_succeeds_for_same_seat(self):
        barrier = threading.Barrier(2)

        def attempt_hold(customer_id):
            close_old_connections()
            try:
                customer = User.objects.get(pk=customer_id)
                barrier.wait(timeout=5)
                hold_seats(customer=customer, trip_id=self.trip.id, seat_codes=["A1"])
                return "success"
            except SeatConflictError:
                return "conflict"
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(attempt_hold, [user.id for user in self.customers]))

        self.assertCountEqual(results, ["success", "conflict"])
        self.assertEqual(Booking.objects.filter(status=Booking.Status.PENDING).count(), 1)
        self.assertEqual(
            self.trip.seats.get(seat_code="A1").status,
            TripSeat.Status.HELD,
        )
