from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase


User = get_user_model()


class AuthenticationAPITests(APITestCase):
    def setUp(self):
        self.password = "StrongPass123!"
        self.user = User.objects.create_user(
            username="demo_customer",
            email="customer@example.com",
            password=self.password,
        )

    def test_customer_can_register(self):
        response = self.client.post(
            reverse("register"),
            {
                "username": "new_customer",
                "email": "new@example.com",
                "password": "AnotherPass123!",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created_user = User.objects.get(username="new_customer")
        self.assertEqual(created_user.role, User.Role.CUSTOMER)
        self.assertTrue(created_user.check_password("AnotherPass123!"))

    def test_user_can_get_tokens_and_view_profile(self):
        token_response = self.client.post(
            reverse("token-obtain-pair"),
            {"username": self.user.username, "password": self.password},
        )

        self.assertEqual(token_response.status_code, status.HTTP_200_OK)
        self.assertIn("access", token_response.data)
        self.assertIn("refresh", token_response.data)

        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {token_response.data['access']}"
        )
        profile_response = self.client.get(reverse("current-user"))

        self.assertEqual(profile_response.status_code, status.HTTP_200_OK)
        self.assertEqual(profile_response.data["username"], self.user.username)
        self.assertEqual(profile_response.data["role"], User.Role.CUSTOMER)

    def test_profile_requires_authentication(self):
        response = self.client.get(reverse("current-user"))

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
