from django.shortcuts import get_object_or_404
from django.db.models import Sum
from django.db.models.functions import Coalesce
from decimal import Decimal
from rest_framework import generics, status
from rest_framework.response import Response

from .models import Booking, Payment
from .permissions import IsCustomer
from .serializers import BookingSerializer, HoldSeatsSerializer, PassengerDetailsSerializer
from .serializers import AdminSummarySerializer
from transport.models import TripSeat
from transport.permissions import IsAdminRole
from .services import (
    BookingStateError,
    SeatConflictError,
    cancel_booking,
    confirm_counter_booking,
    expire_booking_if_needed,
    hold_seats,
)
from .esewa import EsewaPaymentError, save_passenger_details


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


class PassengerDetailsView(generics.GenericAPIView):
    permission_classes = [IsCustomer]
    serializer_class = PassengerDetailsSerializer

    def post(self, request, booking_reference):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            booking = save_passenger_details(
                customer=request.user,
                booking_reference=booking_reference,
                passengers=serializer.validated_data["passengers"],
            )
        except Booking.DoesNotExist:
            return Response({"detail": "Booking not found."}, status=status.HTTP_404_NOT_FOUND)
        except EsewaPaymentError as error:
            return Response(
                {"detail": str(error), "code": "invalid_booking_state"},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(BookingSerializer(booking, context={"request": request}).data)


class ConfirmCounterBookingView(generics.GenericAPIView):
    permission_classes = [IsCustomer]
    serializer_class = BookingSerializer

    def post(self, request, booking_reference):
        try:
            booking = confirm_counter_booking(
                customer=request.user,
                booking_reference=booking_reference,
            )
        except Booking.DoesNotExist:
            return Response({"detail": "Booking not found."}, status=status.HTTP_404_NOT_FOUND)
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


class AdminBookingListView(generics.ListAPIView):
    serializer_class = BookingSerializer
    permission_classes = [IsAdminRole]
    pagination_class = None

    def get_queryset(self):
        return (
            Booking.objects.select_related(
                "trip", "trip__bus", "trip__bus__operator", "trip__route"
            )
            .prefetch_related("seats__trip_seat", "payments")
            .order_by("-created_at")
        )


class AdminSummaryView(generics.GenericAPIView):
    serializer_class = AdminSummarySerializer
    permission_classes = [IsAdminRole]

    def get(self, request):
        confirmed = Booking.objects.filter(status=Booking.Status.CONFIRMED)
        revenue = Payment.objects.filter(status=Payment.Status.PAID).aggregate(
            value=Coalesce(Sum("amount"), Decimal("0.00"))
        )["value"]
        booked_seats = TripSeat.objects.filter(status=TripSeat.Status.BOOKED).count()
        total_trip_seats = TripSeat.objects.count()
        occupancy = (
            Decimal(booked_seats * 100) / Decimal(total_trip_seats)
            if total_trip_seats
            else Decimal("0.00")
        )
        serializer = self.get_serializer(
            {
                "total_bookings": Booking.objects.count(),
                "confirmed_bookings": confirmed.count(),
                "total_revenue": revenue,
                "booked_seats": booked_seats,
                "total_trip_seats": total_trip_seats,
                "occupancy_rate": occupancy.quantize(Decimal("0.01")),
            }
        )
        return Response(serializer.data)
