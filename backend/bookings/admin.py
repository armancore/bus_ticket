from django.contrib import admin

from .models import Booking, BookingSeat, Payment


class BookingSeatInline(admin.TabularInline):
    model = BookingSeat
    extra = 0
    readonly_fields = ("trip_seat", "passenger_name", "age", "gender", "fare_charged")


class PaymentInline(admin.TabularInline):
    model = Payment
    extra = 0
    readonly_fields = ("amount", "status", "transaction_reference", "paid_at")


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = ("booking_reference", "customer", "trip", "status", "total_amount", "created_at")
    list_filter = ("status", "created_at")
    search_fields = ("booking_reference", "customer__username")
    autocomplete_fields = ("customer", "trip")
    readonly_fields = ("booking_reference", "created_at")
    inlines = (BookingSeatInline, PaymentInline)


@admin.register(BookingSeat)
class BookingSeatAdmin(admin.ModelAdmin):
    list_display = ("booking", "trip_seat", "passenger_name", "fare_charged")
    search_fields = ("booking__booking_reference", "trip_seat__seat_code", "passenger_name")
    autocomplete_fields = ("booking", "trip_seat")


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ("transaction_reference", "booking", "amount", "status", "paid_at")
    list_filter = ("status",)
    search_fields = ("transaction_reference", "booking__booking_reference")
    readonly_fields = ("transaction_reference", "paid_at")
