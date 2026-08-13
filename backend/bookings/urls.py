from django.urls import path

from .views import (
    BookingDetailView,
    BookingListView,
    CancelBookingView,
    ConfirmCounterBookingView,
    PassengerDetailsView,
    HoldSeatsView,
    AdminBookingListView,
    AdminSummaryView,
)


urlpatterns = [
    path("admin/summary/", AdminSummaryView.as_view(), name="admin-summary"),
    path("admin/all/", AdminBookingListView.as_view(), name="admin-booking-list"),
    path("", BookingListView.as_view(), name="booking-list"),
    path("hold/", HoldSeatsView.as_view(), name="hold-seats"),
    path("<str:booking_reference>/", BookingDetailView.as_view(), name="booking-detail"),
    path(
        "<str:booking_reference>/passengers/",
        PassengerDetailsView.as_view(),
        name="booking-passengers",
    ),
    path(
        "<str:booking_reference>/cancel/",
        CancelBookingView.as_view(),
        name="cancel-booking",
    ),
    path(
        "<str:booking_reference>/confirm-counter/",
        ConfirmCounterBookingView.as_view(),
        name="confirm-counter-booking",
    ),
]
