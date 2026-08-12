from rest_framework import generics, permissions

from .filters import TripFilter
from .models import Route, Trip
from .serializers import RouteSerializer, TripDetailSerializer, TripListSerializer


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
