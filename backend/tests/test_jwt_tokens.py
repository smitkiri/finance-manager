"""Tests for JWT encode/decode helpers."""

from datetime import UTC, datetime, timedelta

import jwt as pyjwt
import pytest

from app.config import settings
from app.utils.jwt_tokens import (
    InvalidTokenError,
    decode_access_token,
    encode_access_token,
)


@pytest.fixture(autouse=True)
def _configure_secret(monkeypatch):
    monkeypatch.setattr(settings, "jwt_signing_secret", "test-secret-do-not-use")
    monkeypatch.setattr(settings, "jwt_access_token_ttl_days", 30)


def test_encode_then_decode_roundtrips_user_id():
    token = encode_access_token(user_id="u-1")
    claims = decode_access_token(token)
    assert claims["sub"] == "u-1"
    # household_id is intentionally not in the payload anymore
    assert "household_id" not in claims


def test_decode_permissive_to_legacy_token_with_household_id():
    """A legacy token (with a household_id claim) still decodes — the claim
    is simply ignored downstream."""
    legacy = pyjwt.encode(
        {
            "sub": "u-legacy",
            "household_id": "h-old",
            "iat": int(datetime.now(UTC).timestamp()),
            "exp": int((datetime.now(UTC) + timedelta(days=30)).timestamp()),
        },
        "test-secret-do-not-use",
        algorithm="HS256",
    )
    claims = decode_access_token(legacy)
    assert claims["sub"] == "u-legacy"


def test_encode_sets_30_day_exp(monkeypatch):
    monkeypatch.setattr(settings, "jwt_access_token_ttl_days", 30)
    token = encode_access_token(user_id="u-1")
    claims = pyjwt.decode(token, "test-secret-do-not-use", algorithms=["HS256"])
    delta = datetime.fromtimestamp(claims["exp"], UTC) - datetime.fromtimestamp(
        claims["iat"], UTC
    )
    assert delta == timedelta(days=30)


def test_decode_rejects_expired_token():
    expired = pyjwt.encode(
        {
            "sub": "u-1",
            "iat": int((datetime.now(UTC) - timedelta(days=60)).timestamp()),
            "exp": int((datetime.now(UTC) - timedelta(days=30)).timestamp()),
        },
        "test-secret-do-not-use",
        algorithm="HS256",
    )
    with pytest.raises(InvalidTokenError):
        decode_access_token(expired)


def test_decode_rejects_wrong_signature():
    token = pyjwt.encode(
        {"sub": "u-1"},
        "different-secret",
        algorithm="HS256",
    )
    with pytest.raises(InvalidTokenError):
        decode_access_token(token)


def test_decode_rejects_tampered_payload():
    token = encode_access_token(user_id="u-1")
    # Mangle the payload section.
    head, _, sig = token.split(".")
    tampered = f"{head}.eyJzdWIiOiJoYWNrZXIifQ.{sig}"
    with pytest.raises(InvalidTokenError):
        decode_access_token(tampered)


def test_decode_rejects_garbage_string():
    with pytest.raises(InvalidTokenError):
        decode_access_token("not-a-jwt-at-all")
