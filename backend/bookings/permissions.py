from rest_framework.permissions import BasePermission


class IsCustomer(BasePermission):
    message = "Only customer accounts can manage bookings."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == request.user.Role.CUSTOMER
        )
