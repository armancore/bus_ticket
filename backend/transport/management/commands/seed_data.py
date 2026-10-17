from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from transport.models import Bus, Route

from .ensure_daily_trips import DEMO_BUS_PLATE, ensure_daily_trips


User = get_user_model()


def make_layout(rows, left_columns=2, right_columns=2):
    seats = []
    letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    total_columns = left_columns + right_columns
    for row in range(1, rows + 1):
        for column in range(1, total_columns + 1):
            seats.append(
                {"code": f"{letters[row - 1]}{column}", "row": row, "column": column}
            )
    return {
        "decks": [
            {
                "name": "LOWER",
                "rows": rows,
                "columns": total_columns,
                "aisle_after_columns": [left_columns],
                "seats": seats,
            }
        ]
    }


class Command(BaseCommand):
    help = "Create demo users, a bus, routes, and trips for today and tomorrow."

    def handle(self, *args, **options):
        operator, _ = User.objects.update_or_create(
            username="demo_operator",
            defaults={
                "email": "operator@example.com",
                "first_name": "Demo",
                "last_name": "Operator",
                "role": User.Role.OPERATOR,
            },
        )
        operator.set_password("Operator@12345")
        operator.save(update_fields=["password"])

        customer, _ = User.objects.update_or_create(
            username="demo_customer",
            defaults={
                "email": "customer@example.com",
                "first_name": "Demo",
                "last_name": "Customer",
                "role": User.Role.CUSTOMER,
            },
        )
        customer.set_password("Customer@12345")
        customer.save(update_fields=["password"])

        Bus.objects.update_or_create(
            plate_number=DEMO_BUS_PLATE,
            defaults={
                "operator": operator,
                "name": "Himalayan Express",
                "bus_type": "AC Deluxe",
                "layout": make_layout(rows=8),
            },
        )

        Route.objects.get_or_create(
            origin="Kathmandu",
            destination="Pokhara",
            defaults={
                "distance": Decimal("200.00"),
                "estimated_duration": timedelta(hours=7),
            },
        )
        Route.objects.get_or_create(
            origin="Kathmandu",
            destination="Chitwan",
            defaults={
                "distance": Decimal("150.00"),
                "estimated_duration": timedelta(hours=5),
            },
        )

        ensure_daily_trips()

        self.stdout.write(self.style.SUCCESS("Demo data is ready."))
        self.stdout.write("Customer: demo_customer / Customer@12345")
        self.stdout.write("Operator: demo_operator / Operator@12345")
