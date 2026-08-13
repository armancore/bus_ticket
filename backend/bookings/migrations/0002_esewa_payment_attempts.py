import uuid

from django.db import migrations, models
from django.db.models import Q
from django.utils import timezone


def prepare_existing_payments(apps, schema_editor):
    Payment = apps.get_model("bookings", "Payment")
    for payment in Payment.objects.all():
        payment.transaction_uuid = uuid.uuid4()
        if payment.status == "SUCCESS":
            payment.status = "PAID"
        payment.gateway = "mock"
        payment.save(update_fields=["transaction_uuid", "status", "gateway"])


class Migration(migrations.Migration):
    dependencies = [("bookings", "0001_initial")]

    operations = [
        migrations.RenameField(
            model_name="payment",
            old_name="paid_at",
            new_name="verified_at",
        ),
        migrations.AddField(
            model_name="payment",
            name="transaction_uuid",
            field=models.UUIDField(null=True, editable=False),
        ),
        migrations.AddField(
            model_name="payment",
            name="gateway",
            field=models.CharField(default="esewa", max_length=20),
        ),
        migrations.AddField(
            model_name="payment",
            name="raw_gateway_response",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="payment",
            name="created_at",
            field=models.DateTimeField(auto_now_add=True, default=timezone.now),
            preserve_default=False,
        ),
        migrations.RunPython(prepare_existing_payments, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name="payment",
            name="transaction_reference",
        ),
        migrations.AlterField(
            model_name="payment",
            name="transaction_uuid",
            field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True),
        ),
        migrations.AlterField(
            model_name="payment",
            name="status",
            field=models.CharField(
                choices=[
                    ("INITIATED", "Initiated"),
                    ("PENDING", "Pending"),
                    ("PAID", "Paid"),
                    ("FAILED", "Failed"),
                ],
                default="INITIATED",
                max_length=9,
            ),
        ),
        migrations.AddConstraint(
            model_name="payment",
            constraint=models.UniqueConstraint(
                fields=("booking",),
                condition=Q(status="PAID"),
                name="one_paid_attempt_per_booking",
            ),
        ),
    ]
