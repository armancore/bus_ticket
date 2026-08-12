import django_filters

from .models import Trip


class TripFilter(django_filters.FilterSet):
    origin = django_filters.CharFilter(field_name="route__origin", lookup_expr="iexact")
    destination = django_filters.CharFilter(
        field_name="route__destination",
        lookup_expr="iexact",
    )
    date = django_filters.DateFilter(field_name="departure_datetime", lookup_expr="date")

    class Meta:
        model = Trip
        fields = ("origin", "destination", "date")
