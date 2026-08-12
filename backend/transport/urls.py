from django.urls import path

from .views import RouteListView, TripDetailView, TripListView


urlpatterns = [
    path("routes/", RouteListView.as_view(), name="route-list"),
    path("trips/", TripListView.as_view(), name="trip-list"),
    path("trips/<int:pk>/", TripDetailView.as_view(), name="trip-detail"),
]
