import requests
from django.conf import settings
from django.http import HttpResponseBadRequest
from django.shortcuts import redirect
from django.views import View
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.response import Response

from .esewa import (
    EsewaPaymentError,
    EsewaVerificationError,
    decode_callback_data,
    fail_esewa_payment,
    frontend_redirect,
    initiate_esewa_payment,
    verify_esewa_payment,
)
from .models import Booking, Payment
from .permissions import IsCustomer
from .serializers import (
    EsewaInitiationResponseSerializer,
    EsewaVerificationResponseSerializer,
    InitiateEsewaSerializer,
)


class InitiateEsewaView(generics.GenericAPIView):
    permission_classes = [IsCustomer]
    serializer_class = InitiateEsewaSerializer

    @extend_schema(responses={201: EsewaInitiationResponseSerializer})
    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            _payment, fields = initiate_esewa_payment(
                customer=request.user,
                booking_id=serializer.validated_data["booking_id"],
            )
        except Booking.DoesNotExist:
            return Response({"detail": "Booking not found."}, status=status.HTTP_404_NOT_FOUND)
        except EsewaPaymentError as error:
            return Response({"detail": str(error)}, status=status.HTTP_409_CONFLICT)
        return Response(
            {"form_url": settings.ESEWA_FORM_URL, "fields": fields},
            status=status.HTTP_201_CREATED,
        )


class VerifyEsewaView(generics.GenericAPIView):
    permission_classes = [IsCustomer]
    serializer_class = EsewaVerificationResponseSerializer

    def post(self, request, transaction_uuid):
        payment = Payment.objects.filter(
            transaction_uuid=transaction_uuid,
            booking__customer=request.user,
        ).first()
        if payment is None:
            return Response({"detail": "Payment not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            payment = verify_esewa_payment(transaction_uuid)
        except EsewaVerificationError as error:
            return Response({"detail": str(error)}, status=status.HTTP_409_CONFLICT)
        except requests.RequestException:
            return Response(
                {"detail": "eSewa status could not be checked."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response(
            {
                "status": payment.status,
                "booking_reference": payment.booking.booking_reference,
            }
        )


@method_decorator(csrf_exempt, name="dispatch")
class EsewaSuccessCallbackView(View):
    def get(self, request):
        try:
            callback = decode_callback_data(request.GET.get("data", ""))
            payment = verify_esewa_payment(callback["transaction_uuid"])
        except (KeyError, Payment.DoesNotExist, EsewaPaymentError, requests.RequestException):
            return redirect(frontend_redirect("/payment/failure", reason="verification_failed"))
        return redirect(
            frontend_redirect(
                "/payment/success",
                booking=payment.booking.booking_reference,
            )
        )


@method_decorator(csrf_exempt, name="dispatch")
class EsewaFailureCallbackView(View):
    def get(self, request):
        try:
            callback = decode_callback_data(request.GET.get("data", ""))
            payment = fail_esewa_payment(callback["transaction_uuid"])
        except (KeyError, Payment.DoesNotExist, EsewaPaymentError):
            return HttpResponseBadRequest("Invalid eSewa failure callback.")
        return redirect(
            frontend_redirect(
                "/payment/failure",
                booking=payment.booking.booking_reference,
            )
        )
