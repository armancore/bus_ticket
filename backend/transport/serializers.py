from rest_framework import serializers

from .models import Bus, Route, Trip


class RouteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Route
        fields = ("id", "origin", "destination", "distance", "estimated_duration")


class BusSummarySerializer(serializers.ModelSerializer):
    operator_name = serializers.CharField(source="operator.username", read_only=True)

    class Meta:
        model = Bus
        fields = ("id", "name", "plate_number", "bus_type", "operator_name")


class TripListSerializer(serializers.ModelSerializer):
    bus = BusSummarySerializer(read_only=True)
    route = RouteSerializer(read_only=True)

    class Meta:
        model = Trip
        fields = (
            "id",
            "bus",
            "route",
            "departure_datetime",
            "arrival_datetime",
            "base_fare",
            "status",
        )


class TripDetailSerializer(TripListSerializer):
    bus_layout = serializers.JSONField(source="bus.layout", read_only=True)

    class Meta(TripListSerializer.Meta):
        fields = (*TripListSerializer.Meta.fields, "bus_layout")
