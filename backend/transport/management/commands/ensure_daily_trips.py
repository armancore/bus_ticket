from datetime import datetime, time, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from transport.models import Bus, Route, Trip


DEMO_BUS_PLATE = "BA-2-KHA-2026"
# Spread through the day so a visitor finds an upcoming bus at almost any hour.
DEPARTURE_TIMES = [time(6, 30), time(10, 0), time(13, 30), time(17, 0), time(20, 30)]
ROUTE_FARES = {
    ("Kathmandu", "Pokhara"): Decimal("1200.00"),
    ("Kathmandu", "Chitwan"): Decimal("900.00"),
}


def ensure_daily_trips(days=2):
    """Create any missing demo trips from today through the next `days - 1` days.

    Existing trips are left untouched, so an operator's cancellation or fare
    change survives every run.
    """
    bus = Bus.objects.filter(plate_number=DEMO_BUS_PLATE).first()
    if bus is None:
        return None

    created = 0
    today = timezone.localdate()
    for (origin, destination), fare in ROUTE_FARES.items():
        route = Route.objects.filter(origin=origin, destination=destination).first()
        if route is None:
            continue
        for offset in range(days):
            for departure_time in DEPARTURE_TIMES:
                departure = timezone.make_aware(
                    datetime.combine(today + timedelta(days=offset), departure_time)
                )
                with transaction.atomic():
                    if Trip.objects.filter(
                        bus=bus, route=route, departure_datetime=departure
                    ).exists():
                        continue
                    Trip.objects.create(
                        bus=bus,
                        route=route,
                        departure_datetime=departure,
                        arrival_datetime=departure + route.estimated_duration,
                        base_fare=fare,
                    )
                    created += 1
    return created


class Command(BaseCommand):
    help = "Make sure the demo bus has trips scheduled for today and tomorrow."

    def handle(self, *args, **options):
        created = ensure_daily_trips()
        if created is None:
            self.stdout.write("Demo bus not found; run seed_data first. Nothing to do.")
            return
        self.stdout.write(self.style.SUCCESS(f"Created {created} demo trip(s)."))
