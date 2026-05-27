"""Random URL-safe tokens for invitation links."""

import secrets


def generate_invitation_token() -> str:
    """Return a URL-safe random token suitable for invitation links."""
    return secrets.token_urlsafe(32)
