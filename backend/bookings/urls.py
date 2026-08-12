from django.urls import path

from .views import (
    BookingDetailView,
    BookingListView,
    CancelBookingView,
    ConfirmBookingView,
    HoldSeatsView,
)


urlpatterns = [
    path("", BookingListView.as_view(), name="booking-list"),
    path("hold/", HoldSeatsView.as_view(), name="hold-seats"),
    path("<str:booking_reference>/", BookingDetailView.as_view(), name="booking-detail"),
    path(
        "<str:booking_reference>/confirm/",
        ConfirmBookingView.as_view(),
        name="confirm-booking",
    ),
    path(
        "<str:booking_reference>/cancel/",
        CancelBookingView.as_view(),
        name="cancel-booking",
    ),
]
