from rest_framework import serializers

from datetime import datetime

from django.utils import timezone

from .models import Bus, Route, Trip, TripSeat


class RouteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Route
        fields = ("id", "origin", "destination", "distance", "estimated_duration")


class BusSummarySerializer(serializers.ModelSerializer):
    operator_name = serializers.CharField(source="operator.username", read_only=True)

    class Meta:
        model = Bus
        fields = ("id", "name", "plate_number", "bus_type", "operator_name")


class OperatorBusSerializer(serializers.ModelSerializer):
    seat_count = serializers.IntegerField(
        min_value=4,
        max_value=60,
        required=False,
        write_only=True,
        help_text="Total seats in a 2+2 layout; must be a multiple of four.",
    )

    class Meta:
        model = Bus
        fields = ("id", "name", "plate_number", "bus_type", "layout", "seat_count")
        extra_kwargs = {"layout": {"required": False}}

    def validate_seat_count(self, value):
        if value % 4:
            raise serializers.ValidationError(
                "Seat count must be a multiple of 4 for a 2+2 layout."
            )
        return value

    def validate(self, attrs):
        if not self.instance and "seat_count" not in attrs and "layout" not in attrs:
            raise serializers.ValidationError(
                {"seat_count": "Choose the number of seats."}
            )
        return attrs

    def create(self, validated_data):
        seat_count = validated_data.pop("seat_count", None)
        if seat_count is not None:
            validated_data["layout"] = build_two_by_two_layout(seat_count)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        seat_count = validated_data.pop("seat_count", None)
        if seat_count is not None:
            validated_data["layout"] = build_two_by_two_layout(seat_count)
        return super().update(instance, validated_data)

    def to_representation(self, instance):
        representation = super().to_representation(instance)
        representation["seat_count"] = len(instance.seat_codes)
        return representation


def build_two_by_two_layout(seat_count):
    """Build rows with two seats, an aisle, and two seats on the other side."""
    seats = []
    for row in range(1, (seat_count // 4) + 1):
        row_letter = chr(64 + row)
        for column in range(1, 5):
            seats.append(
                {
                    "code": f"{row_letter}{column}",
                    "row": row,
                    "column": column,
                }
            )
    return {
        "decks": [
            {
                "name": "LOWER",
                "rows": seat_count // 4,
                "columns": 4,
                "aisle_after_columns": [2],
                "seats": seats,
            }
        ]
    }


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


class OperatorTripSerializer(TripListSerializer):
    bus_id = serializers.PrimaryKeyRelatedField(
        source="bus",
        queryset=Bus.objects.all(),
        write_only=True,
    )
    route_id = serializers.PrimaryKeyRelatedField(
        source="route",
        queryset=Route.objects.all(),
        write_only=True,
    )

    class Meta(TripListSerializer.Meta):
        fields = (*TripListSerializer.Meta.fields, "bus_id", "route_id")

    def validate_bus_id(self, bus):
        request = self.context["request"]
        if bus.operator_id != request.user.id:
            raise serializers.ValidationError("Choose one of your own buses.")
        if self.instance and self.instance.bus_id != bus.id:
            raise serializers.ValidationError(
                "A trip's bus cannot be changed after its seat inventory is created."
            )
        return bus

    def validate(self, attrs):
        departure = attrs.get(
            "departure_datetime",
            getattr(self.instance, "departure_datetime", None),
        )
        arrival = attrs.get(
            "arrival_datetime",
            getattr(self.instance, "arrival_datetime", None),
        )
        if departure and arrival and arrival <= departure:
            raise serializers.ValidationError(
                {"arrival_datetime": "Arrival must be after departure."}
            )
        return attrs


class TripSeatSerializer(serializers.ModelSerializer):
    effective_fare = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        read_only=True,
    )
    is_held_by_me = serializers.SerializerMethodField()

    class Meta:
        model = TripSeat
        fields = ("id", "seat_code", "status", "effective_fare", "is_held_by_me")

    def get_is_held_by_me(self, seat) -> bool:
        request = self.context.get("request")
        return bool(
            request
            and request.user.is_authenticated
            and seat.status == TripSeat.Status.HELD
            and seat.held_by_id == request.user.id
        )


class SeatMapSerializer(serializers.ModelSerializer):
    layout = serializers.JSONField(source="bus.layout", read_only=True)
    seats = TripSeatSerializer(many=True, read_only=True)
    refreshed_at = serializers.SerializerMethodField()

    class Meta:
        model = Trip
        fields = ("id", "status", "layout", "seats", "refreshed_at")

    def get_refreshed_at(self, _trip) -> datetime:
        return timezone.now()


class ManifestPassengerSerializer(serializers.Serializer):
    booking_reference = serializers.CharField()
    seat_code = serializers.CharField()
    passenger_name = serializers.CharField()
    age = serializers.IntegerField()
    gender = serializers.CharField()
    fare_charged = serializers.DecimalField(max_digits=10, decimal_places=2)


class PassengerManifestSerializer(serializers.Serializer):
    trip = TripListSerializer()
    passenger_count = serializers.IntegerField()
    passengers = ManifestPassengerSerializer(many=True)
