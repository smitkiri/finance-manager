"""POST/GET/DELETE /api/invitations and the public lookup. Accept is in
test_invitations_accept.py."""

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Invitation
from tests.conftest import auth_headers


@pytest.fixture(autouse=True)
def _disable_demo(monkeypatch):
    monkeypatch.setattr(settings, "finance_manager_demo_mode", False)


# ---------------------------------------------------------------------------
# POST /api/invitations
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_invitation_happy_path(
    raw_client: AsyncClient,
    db_session: AsyncSession,
    signed_in_user,
):
    user, household, token = signed_in_user
    r = await raw_client.post(
        "/api/invitations",
        headers=auth_headers(token),
        json={"email": "spouse@example.com"},
    )
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["email"] == "spouse@example.com"
    assert data["status"] == "pending"
    assert len(data["token"]) >= 40
    assert data["invitedBy"]["id"] == user.id

    row = (
        await db_session.execute(
            select(Invitation).where(Invitation.email == "spouse@example.com")
        )
    ).scalar_one()
    assert row.household_id == household.id
    # expires_at ~7 days out; we check >6d to allow clock drift in CI.
    expires_at = row.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    assert expires_at > datetime.now(UTC) + timedelta(days=6)


@pytest.mark.asyncio
async def test_create_invitation_refuses_self(raw_client: AsyncClient, signed_in_user):
    user, _household, token = signed_in_user
    r = await raw_client.post(
        "/api/invitations",
        headers=auth_headers(token),
        json={"email": user.email},
    )
    assert r.status_code == 400
    assert "yourself" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_create_invitation_refuses_existing_member(
    raw_client: AsyncClient, two_member_household
):
    _user_a, user_b, _household, token_a = two_member_household
    r = await raw_client.post(
        "/api/invitations",
        headers=auth_headers(token_a),
        json={"email": user_b.email},
    )
    assert r.status_code == 409
    assert "member" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_create_invitation_auto_revokes_previous(
    raw_client: AsyncClient,
    db_session: AsyncSession,
    signed_in_user,
):
    _user, _household, token = signed_in_user
    r1 = await raw_client.post(
        "/api/invitations",
        headers=auth_headers(token),
        json={"email": "x@example.com"},
    )
    first_id = r1.json()["id"]
    r2 = await raw_client.post(
        "/api/invitations",
        headers=auth_headers(token),
        json={"email": "x@example.com"},
    )
    assert r2.status_code == 201
    assert r2.json()["id"] != first_id

    first = (
        await db_session.execute(select(Invitation).where(Invitation.id == first_id))
    ).scalar_one()
    assert first.revoked_at is not None


@pytest.mark.asyncio
async def test_create_invitation_requires_auth(raw_client: AsyncClient):
    r = await raw_client.post("/api/invitations", json={"email": "x@x.com"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_create_invitation_503_in_demo_mode(
    raw_client: AsyncClient,
    db_session: AsyncSession,
    demo_mode_enabled,
):
    # Demo mode needs the demo user to exist (get_current_user looks it up).
    from app.models import Household, User
    from app.utils.passwords import hash_password

    db_session.add(Household(id=settings.demo_household_id, name="Demo"))
    await db_session.flush()
    db_session.add(
        User(
            id=settings.demo_user_id,
            name="Demo",
            email="demo@tally.local",
            password_hash=hash_password("unused"),
            household_id=settings.demo_household_id,
        )
    )
    await db_session.flush()

    r = await raw_client.post("/api/invitations", json={"email": "x@example.com"})
    assert r.status_code == 503
