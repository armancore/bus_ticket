from django.urls import path

from .payment_views import (
    EsewaFailureCallbackView,
    EsewaSuccessCallbackView,
    InitiateEsewaView,
    VerifyEsewaView,
)


urlpatterns = [
    path("esewa/initiate/", InitiateEsewaView.as_view(), name="esewa-initiate"),
    path("esewa/success/", EsewaSuccessCallbackView.as_view(), name="esewa-success"),
    path("esewa/failure/", EsewaFailureCallbackView.as_view(), name="esewa-failure"),
    path(
        "esewa/verify/<uuid:transaction_uuid>/",
        VerifyEsewaView.as_view(),
        name="esewa-verify",
    ),
]
