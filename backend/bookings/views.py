from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.response import Response

from .models import Booking
from .permissions import IsCustomer
from .serializers import BookingSerializer, ConfirmBookingSerializer, HoldSeatsSerializer
from .services import (
    BookingStateError,
    HoldExpiredError,
    MockPaymentFailedError,
    SeatConflictError,
    cancel_booking,
    confirm_booking,
    expire_booking_if_needed,
    hold_seats,
)


def customer_booking_queryset(customer):
    return (
        Booking.objects.filter(customer=customer)
        .select_related("trip", "trip__bus", "trip__bus__operator", "trip__route")
        .prefetch_related("seats__trip_seat", "payments")
    )


class HoldSeatsView(generics.GenericAPIView):
    permission_classes = [IsCustomer]
    serializer_class = HoldSeatsSerializer

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            booking, held_until = hold_seats(
                customer=request.user,
                **serializer.validated_data,
            )
        except SeatConflictError as error:
            return Response(
                {
                    "detail": str(error),
                    "code": "seat_conflict",
                    "conflicting_seats": error.seat_codes,
                },
                status=status.HTTP_409_CONFLICT,
            )
        except BookingStateError as error:
            return Response(
                {"detail": str(error), "code": "trip_unavailable"},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(
            {
                "booking_reference": booking.booking_reference,
                "hold_expires_at": held_until,
            },
            status=status.HTTP_201_CREATED,
        )


class ConfirmBookingView(generics.GenericAPIView):
    permission_classes = [IsCustomer]
    serializer_class = ConfirmBookingSerializer

    def post(self, request, booking_reference):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            booking = confirm_booking(
                customer=request.user,
                booking_reference=booking_reference,
                payment_success=serializer.validated_data["simulate_payment_success"],
                passengers=serializer.validated_data["passengers"],
            )
        except Booking.DoesNotExist:
            return Response({"detail": "Booking not found."}, status=status.HTTP_404_NOT_FOUND)
        except HoldExpiredError as error:
            return Response(
                {"detail": str(error), "code": "hold_expired"},
                status=status.HTTP_409_CONFLICT,
            )
        except MockPaymentFailedError as error:
            return Response(
                {"detail": str(error), "code": "payment_failed"},
                status=status.HTTP_402_PAYMENT_REQUIRED,
            )
        except BookingStateError as error:
            return Response(
                {"detail": str(error), "code": "invalid_booking_state"},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(BookingSerializer(booking, context={"request": request}).data)


class BookingListView(generics.ListAPIView):
    serializer_class = BookingSerializer
    permission_classes = [IsCustomer]
    pagination_class = None

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Booking.objects.none()
        return customer_booking_queryset(self.request.user)


class BookingDetailView(generics.RetrieveAPIView):
    serializer_class = BookingSerializer
    permission_classes = [IsCustomer]
    lookup_field = "booking_reference"

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Booking.objects.none()
        return customer_booking_queryset(self.request.user)

    def retrieve(self, request, *args, **kwargs):
        reference = kwargs["booking_reference"]
        try:
            expire_booking_if_needed(customer=request.user, booking_reference=reference)
        except Booking.DoesNotExist:
            pass
        return super().retrieve(request, *args, **kwargs)


class CancelBookingView(generics.GenericAPIView):
    permission_classes = [IsCustomer]
    serializer_class = BookingSerializer

    def post(self, request, booking_reference):
        get_object_or_404(
            Booking,
            booking_reference=booking_reference,
            customer=request.user,
        )
        try:
            booking = cancel_booking(
                customer=request.user,
                booking_reference=booking_reference,
            )
        except BookingStateError as error:
            return Response(
                {"detail": str(error), "code": "invalid_booking_state"},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(BookingSerializer(booking, context={"request": request}).data)
