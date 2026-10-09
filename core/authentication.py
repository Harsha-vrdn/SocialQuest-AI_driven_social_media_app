from rest_framework.authentication import TokenAuthentication

from .models import AuthSession


class SessionTokenAuthentication(TokenAuthentication):
    """Authenticate a token that belongs to one client session."""

    model = AuthSession
