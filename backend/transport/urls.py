from django.urls import path

from .views import (
    OperatorPassengerManifestView,
    OperatorTripListView,
    RouteListView,
    TripDetailView,
    TripListView,
    TripSeatMapView,
)


urlpatterns = [
    path("routes/", RouteListView.as_view(), name="route-list"),
    path("trips/", TripListView.as_view(), name="trip-list"),
    path("trips/<int:pk>/", TripDetailView.as_view(), name="trip-detail"),
    path("trips/<int:pk>/seats/", TripSeatMapView.as_view(), name="trip-seat-map"),
    path("operator/trips/", OperatorTripListView.as_view(), name="operator-trip-list"),
    path(
        "operator/trips/<int:pk>/manifest/",
        OperatorPassengerManifestView.as_view(),
        name="operator-trip-manifest",
    ),
]
