from django.db.models.deletion import ProtectedError
from rest_framework import generics, permissions, serializers
from rest_framework.response import Response

from bookings.services import expire_holds_for_trip
from bookings.models import BookingSeat

from .filters import TripFilter
from .models import Bus, Route, Trip
from .permissions import IsOperator
from .serializers import (
    RouteSerializer,
    SeatMapSerializer,
    TripDetailSerializer,
    TripListSerializer,
    PassengerManifestSerializer,
    OperatorBusSerializer,
    OperatorTripSerializer,
)


class RouteListView(generics.ListAPIView):
    queryset = Route.objects.all()
    serializer_class = RouteSerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = None


class TripListView(generics.ListAPIView):
    serializer_class = TripListSerializer
    permission_classes = [permissions.AllowAny]
    filterset_class = TripFilter
    pagination_class = None

    def get_queryset(self):
        # select_related performs one JOIN instead of querying bus/route per result.
        return (
            Trip.objects.select_related("bus", "bus__operator", "route")
            .filter(status=Trip.Status.SCHEDULED)
            .order_by("departure_datetime")
        )


class TripDetailView(generics.RetrieveAPIView):
    serializer_class = TripDetailSerializer
    permission_classes = [permissions.AllowAny]
    queryset = Trip.objects.select_related("bus", "bus__operator", "route")


class TripSeatMapView(generics.RetrieveAPIView):
    serializer_class = SeatMapSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        # Prefetch keeps the seat map to two ordered queries: trip/layout, then seats.
        return Trip.objects.select_related("bus").prefetch_related("seats")

    def retrieve(self, request, *args, **kwargs):
        # Lazy cleanup keeps TripSeat as the source of truth without a worker queue.
        expire_holds_for_trip(kwargs["pk"])
        return super().retrieve(request, *args, **kwargs)


class OperatorBusListCreateView(generics.ListCreateAPIView):
    serializer_class = OperatorBusSerializer
    permission_classes = [IsOperator]
    pagination_class = None

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Bus.objects.none()
        return Bus.objects.filter(operator=self.request.user)

    def perform_create(self, serializer):
        # The authenticated operator is always the owner; the client cannot choose it.
        serializer.save(operator=self.request.user)


class OperatorBusDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = OperatorBusSerializer
    permission_classes = [IsOperator]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Bus.objects.none()
        return Bus.objects.filter(operator=self.request.user)

    def perform_destroy(self, instance):
        try:
            instance.delete()
        except ProtectedError as error:
            raise serializers.ValidationError(
                {"detail": "Delete this bus's trips before deleting the bus."}
            ) from error


class OperatorTripListView(generics.ListCreateAPIView):
    serializer_class = OperatorTripSerializer
    permission_classes = [IsOperator]
    pagination_class = None

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Trip.objects.none()
        return (
            Trip.objects.filter(bus__operator=self.request.user)
            .select_related("bus", "bus__operator", "route")
            .order_by("-departure_datetime")
        )


class OperatorTripDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = OperatorTripSerializer
    permission_classes = [IsOperator]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Trip.objects.none()
        return Trip.objects.filter(bus__operator=self.request.user).select_related(
            "bus", "bus__operator", "route"
        )

    def perform_destroy(self, instance):
        try:
            instance.delete()
        except ProtectedError as error:
            raise serializers.ValidationError(
                {"detail": "A trip with booking history cannot be deleted; cancel it instead."}
            ) from error


class OperatorPassengerManifestView(generics.RetrieveAPIView):
    serializer_class = PassengerManifestSerializer
    permission_classes = [IsOperator]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Trip.objects.none()
        # Ownership is enforced here, before object lookup and serialization.
        return Trip.objects.filter(bus__operator=self.request.user).select_related(
            "bus", "bus__operator", "route"
        )

    def retrieve(self, request, *args, **kwargs):
        trip = self.get_object()
        records = (
            BookingSeat.objects.filter(
                booking__trip=trip,
                booking__status="CONFIRMED",
            )
            .select_related("booking", "trip_seat")
            .order_by("trip_seat__seat_code")
        )
        passengers = [
            {
                "booking_reference": record.booking.booking_reference,
                "seat_code": record.trip_seat.seat_code,
                "passenger_name": record.passenger_name,
                "age": record.age,
                "gender": record.gender,
                "fare_charged": record.fare_charged,
            }
            for record in records
        ]
        serializer = self.get_serializer(
            {"trip": trip, "passenger_count": len(passengers), "passengers": passengers}
        )
        return Response(serializer.data)
