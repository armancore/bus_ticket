from django.contrib import admin

from .models import Bus, Route, Trip, TripSeat


@admin.register(Bus)
class BusAdmin(admin.ModelAdmin):
    list_display = ("name", "plate_number", "bus_type", "operator")
    list_filter = ("bus_type",)
    search_fields = ("name", "plate_number", "operator__username")
    autocomplete_fields = ("operator",)


@admin.register(Route)
class RouteAdmin(admin.ModelAdmin):
    list_display = ("origin", "destination", "distance", "estimated_duration")
    search_fields = ("origin", "destination")


@admin.register(Trip)
class TripAdmin(admin.ModelAdmin):
    list_display = (
        "route",
        "bus",
        "departure_datetime",
        "arrival_datetime",
        "base_fare",
        "status",
    )
    list_filter = ("status", "departure_datetime")
    search_fields = ("bus__name", "bus__plate_number", "route__origin", "route__destination")
    autocomplete_fields = ("bus", "route")


@admin.register(TripSeat)
class TripSeatAdmin(admin.ModelAdmin):
    list_display = ("trip", "seat_code", "status", "held_by", "held_until")
    list_filter = ("status",)
    search_fields = ("seat_code", "trip__bus__plate_number", "held_by__username")
    autocomplete_fields = ("trip", "held_by")
    readonly_fields = ("trip", "seat_code")
