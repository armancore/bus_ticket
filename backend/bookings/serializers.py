from datetime import datetime

from rest_framework import serializers

from transport.serializers import TripListSerializer

from .models import Booking, BookingSeat, Payment


class HoldSeatsSerializer(serializers.Serializer):
    trip_id = serializers.IntegerField(min_value=1)
    seat_codes = serializers.ListField(
        child=serializers.CharField(max_length=20),
        allow_empty=False,
    )

    def validate_seat_codes(self, value):
        normalized = [code.strip().upper() for code in value]
        if any(not code for code in normalized):
            raise serializers.ValidationError("Seat codes cannot be empty.")
        if len(normalized) != len(set(normalized)):
            raise serializers.ValidationError("Seat codes must be unique.")
        return normalized


class PassengerSerializer(serializers.Serializer):
    seat_code = serializers.CharField(max_length=20)
    passenger_name = serializers.CharField(max_length=150)
    age = serializers.IntegerField(min_value=1, max_value=120)
    gender = serializers.ChoiceField(choices=BookingSeat.Gender.choices)


class ConfirmBookingSerializer(serializers.Serializer):
    passengers = PassengerSerializer(many=True, allow_empty=False)
    simulate_payment_success = serializers.BooleanField(default=True)

    def validate_passengers(self, value):
        codes = [passenger["seat_code"].strip().upper() for passenger in value]
        if len(codes) != len(set(codes)):
            raise serializers.ValidationError("Passenger seat codes must be unique.")
        return value


class BookingSeatReadSerializer(serializers.ModelSerializer):
    seat_code = serializers.CharField(source="trip_seat.seat_code", read_only=True)
    seat_status = serializers.CharField(source="trip_seat.status", read_only=True)
    fare = serializers.SerializerMethodField()

    class Meta:
        model = BookingSeat
        fields = (
            "seat_code",
            "seat_status",
            "passenger_name",
            "age",
            "gender",
            "fare",
        )

    def get_fare(self, record) -> str:
        fare = record.fare_charged
        if fare is None:
            fare = record.trip_seat.effective_fare
        return f"{fare:.2f}"


class PaymentReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = ("amount", "status", "transaction_reference", "paid_at")


class BookingSerializer(serializers.ModelSerializer):
    trip = TripListSerializer(read_only=True)
    seats = BookingSeatReadSerializer(many=True, read_only=True)
    payments = PaymentReadSerializer(many=True, read_only=True)
    hold_expires_at = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = (
            "booking_reference",
            "status",
            "total_amount",
            "created_at",
            "hold_expires_at",
            "trip",
            "seats",
            "payments",
        )

    def get_hold_expires_at(self, booking) -> datetime | None:
        if booking.status != Booking.Status.PENDING:
            return None
        expiries = [
            record.trip_seat.held_until
            for record in booking.seats.all()
            if record.trip_seat.held_until is not None
        ]
        return min(expiries) if expiries else None


class AdminSummarySerializer(serializers.Serializer):
    total_bookings = serializers.IntegerField()
    confirmed_bookings = serializers.IntegerField()
    total_revenue = serializers.DecimalField(max_digits=12, decimal_places=2)
    booked_seats = serializers.IntegerField()
    total_trip_seats = serializers.IntegerField()
    occupancy_rate = serializers.DecimalField(max_digits=5, decimal_places=2)
