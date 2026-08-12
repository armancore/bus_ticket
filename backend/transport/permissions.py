from rest_framework.permissions import BasePermission


class IsOperator(BasePermission):
    message = "Only operator accounts can access this area."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == request.user.Role.OPERATOR
        )


class IsAdminRole(BasePermission):
    message = "Only admin accounts can access this area."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and (request.user.role == request.user.Role.ADMIN or request.user.is_superuser)
        )
