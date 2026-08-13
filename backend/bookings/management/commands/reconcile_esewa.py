from datetime import timedelta

import requests
from django.core.management.base import BaseCommand
from django.utils import timezone

from bookings.esewa import EsewaPaymentError, verify_esewa_payment
from bookings.models import Payment


class Command(BaseCommand):
    help = "Re-check eSewa attempts that have been unresolved for at least five minutes."

    def handle(self, *args, **options):
        cutoff = timezone.now() - timedelta(minutes=5)
        attempts = Payment.objects.filter(
            gateway="esewa",
            status__in=[Payment.Status.INITIATED, Payment.Status.PENDING],
            created_at__lte=cutoff,
        ).values_list("transaction_uuid", flat=True)
        checked = 0
        for transaction_uuid in attempts.iterator():
            try:
                verify_esewa_payment(transaction_uuid)
            except (EsewaPaymentError, requests.RequestException) as error:
                self.stderr.write(f"{transaction_uuid}: {error}")
            checked += 1

        # Run this command on a schedule (for example cron; Celery beat is optional).
        self.stdout.write(self.style.SUCCESS(f"Reconciled {checked} eSewa attempt(s)."))
