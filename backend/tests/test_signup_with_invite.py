"""Signup with invite_token places the new user in the inviting household."""

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Household, Invitation, User
from tests.conftest import auth_headers


@pytest.fixture(autouse=True)
def _jwt_secret(monkeypatch):
    monkeypatch.setattr(settings, "jwt_signing_secret", "test-secret")
    monkeypatch.setattr(settings, "jwt_access_token_ttl_days", 30)
    monkeypatch.setattr(settings, "finance_manager_demo_mode", False)


@pytest.mark.asyncio
async def test_signup_with_valid_invite_joins_inviting_household(
    raw_client: AsyncClient,
    db_session: AsyncSession,
    signed_in_user,
):
    _user, household, token = signed_in_user
    r = await raw_client.post(
        "/api/invitations",
        headers=auth_headers(token),
        json={"email": "new@example.com"},
    )
    invite_token = r.json()["token"]

    r2 = await raw_client.post(
        "/api/auth/signup",
        json={
            "email": "new@example.com",
            "password": "supersecret",
            "name": "New User",
            "invite_token": invite_token,
        },
    )
    assert r2.status_code == 200, r2.text
    body = r2.json()
    assert body["household"]["id"] == household.id

    inv = (
        await db_session.execute(
            select(Invitation).where(Invitation.token == invite_token)
        )
    ).scalar_one()
    assert inv.consumed_at is not None

    u = (
        await db_session.execute(select(User).where(User.email == "new@example.com"))
    ).scalar_one()
    assert u.household_id == household.id

    # No new household was created
    households = (
        (
            await db_session.execute(
                select(Household).where(Household.name == "New User's Household")
            )
        )
        .scalars()
        .all()
    )
    assert households == []


@pytest.mark.asyncio
async def test_signup_with_email_mismatch_returns_403(
    raw_client: AsyncClient, signed_in_user
):
    _user, _h, token = signed_in_user
    r = await raw_client.post(
        "/api/invitations",
        headers=auth_headers(token),
        json={"email": "expected@example.com"},
    )
    invite_token = r.json()["token"]

    r2 = await raw_client.post(
        "/api/auth/signup",
        json={
            "email": "different@example.com",
            "password": "supersecret",
            "name": "Diff",
            "invite_token": invite_token,
        },
    )
    assert r2.status_code == 403


@pytest.mark.asyncio
async def test_signup_with_invalid_invite_returns_410(raw_client: AsyncClient):
    r = await raw_client.post(
        "/api/auth/signup",
        json={
            "email": "x@example.com",
            "password": "supersecret",
            "name": "X",
            "invite_token": "nope-not-a-token",
        },
    )
    assert r.status_code == 410


@pytest.mark.asyncio
async def test_signup_without_invite_unchanged(raw_client: AsyncClient):
    """Backward-compat: signup without invite_token still creates a new
    household named '<Name>'s Household'."""
    r = await raw_client.post(
        "/api/auth/signup",
        json={
            "email": "solo@example.com",
            "password": "supersecret",
            "name": "Solo",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["household"]["name"] == "Solo's Household"
