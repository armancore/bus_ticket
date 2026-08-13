from decimal import Decimal
from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from transport.models import TripSeat

from .esewa import generate_signature
from .models import Booking, Payment
from .tests import create_trip


User = get_user_model()


class EsewaPaymentTests(APITestCase):
    def setUp(self):
        self.customer = User.objects.create_user(
            username="esewa_customer",
            password="StrongPass123!",
        )
        self.other_customer = User.objects.create_user(
            username="other_esewa_customer",
            password="StrongPass123!",
        )
        operator = User.objects.create_user(
            username="esewa_operator",
            password="StrongPass123!",
            role=User.Role.OPERATOR,
        )
        self.trip = create_trip(operator, plate_number="BA-ESEWA-1")
        self.client.force_authenticate(self.customer)

    def test_signature_matches_known_fixed_value(self):
        signature = generate_signature(
            total_amount="100.00",
            transaction_uuid="11-201-13",
            product_code="EPAYTEST",
            secret="8gBm/:&EnhH.1/q",
        )

        self.assertEqual(signature, "vz+3Nj4iiCfZVp9qP+GPC72gGh5uXmUzxs71GVq98mI=")

    def test_initiate_rejects_booking_owned_by_another_customer(self):
        booking = self._prepare_booking(customer=self.other_customer, seat_code="A1")

        response = self.client.post(reverse("esewa-initiate"), {"booking_id": booking.id})

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(Payment.objects.exists())

    def test_initiate_recomputes_amount_and_returns_signed_server_fields(self):
        booking = self._prepare_booking()
        booking.total_amount = Decimal("1.00")
        booking.save(update_fields=["total_amount"])

        response = self.client.post(reverse("esewa-initiate"), {"booking_id": booking.id})

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["fields"]["total_amount"], "1200.00")
        self.assertEqual(response.data["fields"]["product_code"], "EPAYTEST")
        self.assertNotIn("secret", response.data["fields"])
        booking.refresh_from_db()
        self.assertEqual(booking.total_amount, Decimal("1200.00"))

    @patch("bookings.esewa.requests.get")
    def test_verify_rejects_status_other_than_complete(self, mock_get):
        payment = self._prepare_payment()
        mock_get.return_value = self._gateway_response("PENDING", "1200.00")

        response = self.client.post(reverse("esewa-verify", args=[payment.transaction_uuid]))

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.PENDING)
        self.assertEqual(payment.booking.status, Booking.Status.PENDING)

    @patch("bookings.esewa.requests.get")
    def test_verify_rejects_amount_different_from_server_price(self, mock_get):
        payment = self._prepare_payment()
        mock_get.return_value = self._gateway_response("COMPLETE", "1199.00")

        response = self.client.post(reverse("esewa-verify", args=[payment.transaction_uuid]))

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.FAILED)
        self.assertEqual(payment.booking.status, Booking.Status.PENDING)
        self.assertEqual(self.trip.seats.get(seat_code="A1").status, TripSeat.Status.HELD)

    @patch("bookings.esewa.requests.get")
    def test_verify_is_idempotent_when_repeated(self, mock_get):
        payment = self._prepare_payment()
        mock_get.return_value = self._gateway_response("COMPLETE", "1200.00")
        url = reverse("esewa-verify", args=[payment.transaction_uuid])

        first_response = self.client.post(url)
        second_response = self.client.post(url)

        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        self.assertEqual(second_response.status_code, status.HTTP_200_OK)
        self.assertEqual(mock_get.call_count, 1)
        payment.refresh_from_db()
        payment.booking.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.PAID)
        self.assertEqual(payment.booking.status, Booking.Status.CONFIRMED)
        self.assertEqual(self.trip.seats.get(seat_code="A1").status, TripSeat.Status.BOOKED)
        self.assertEqual(Payment.objects.filter(booking=payment.booking, status=Payment.Status.PAID).count(), 1)

    def _prepare_booking(self, customer=None, seat_code="A1"):
        customer = customer or self.customer
        self.client.force_authenticate(customer)
        hold_response = self.client.post(
            reverse("hold-seats"),
            {"trip_id": self.trip.id, "seat_codes": [seat_code]},
            format="json",
        )
        booking = Booking.objects.get(
            booking_reference=hold_response.data["booking_reference"]
        )
        passenger_response = self.client.post(
            reverse("booking-passengers", args=[booking.booking_reference]),
            {
                "passengers": [
                    {
                        "seat_code": seat_code,
                        "passenger_name": "eSewa Passenger",
                        "age": 24,
                        "gender": "OTHER",
                    }
                ]
            },
            format="json",
        )
        self.assertEqual(passenger_response.status_code, status.HTTP_200_OK)
        self.client.force_authenticate(self.customer)
        return booking

    def _prepare_payment(self):
        booking = self._prepare_booking()
        response = self.client.post(reverse("esewa-initiate"), {"booking_id": booking.id})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        return Payment.objects.get(booking=booking)

    @staticmethod
    def _gateway_response(gateway_status, total_amount):
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {
            "status": gateway_status,
            "total_amount": total_amount,
        }
        return response
