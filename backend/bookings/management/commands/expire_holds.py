from django.core.management.base import BaseCommand

from bookings.services import expire_all_holds


class Command(BaseCommand):
    help = "Release all expired pending seat holds."

    def handle(self, *args, **options):
        released = expire_all_holds()
        self.stdout.write(self.style.SUCCESS(f"Released {released} expired seat hold(s)."))
