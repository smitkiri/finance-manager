"""When a user's household_id changes mid-token, the next request must see
the new household — not the household_id from the claim."""

import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Household, User
from app.utils.jwt_tokens import encode_access_token


@pytest.fixture(autouse=True)
def _jwt_secret(monkeypatch):
    monkeypatch.setattr(settings, "jwt_signing_secret", "test-secret")
    monkeypatch.setattr(settings, "jwt_access_token_ttl_days", 30)
    monkeypatch.setattr(settings, "finance_manager_demo_mode", False)


async def _seed_two_households_two_users(
    db_session: AsyncSession,
) -> tuple[User, User, Household, Household]:
    h1 = Household(id="hh-fresh-1", name="H1")
    h2 = Household(id="hh-fresh-2", name="H2")
    db_session.add_all([h1, h2])
    await db_session.flush()
    user_a = User(
        id="u-fresh-a",
        name="Alice",
        email="alice-fresh@test.local",
        password_hash="",
        household_id=h1.id,
    )
    user_b = User(
        id="u-fresh-b",
        name="Bob",
        email="bob-fresh@test.local",
        password_hash="",
        household_id=h2.id,
    )
    db_session.add_all([user_a, user_b])
    await db_session.flush()
    return user_a, user_b, h1, h2


@pytest.mark.asyncio
async def test_data_request_uses_current_household_id(
    raw_client: AsyncClient, db_session: AsyncSession
) -> None:
    """Seed users A (in H1) and B (in H2). A logs in (token includes H1 id).
    Move A into H2 via a direct DB write. A's next request should reflect
    H2 — not the stale claim."""
    user_a, user_b, h1, h2 = await _seed_two_households_two_users(db_session)

    # Token minted while A was in H1 (no household_id encoded post-phase-B)
    _ = h1  # not used after the token-shape change
    _ = h2
    token_a = encode_access_token(user_id=user_a.id)
    headers = {"Authorization": f"Bearer {token_a}"}

    # Sanity: A sees H1's users
    r = await raw_client.get("/api/users", headers=headers)
    assert r.status_code == 200
    ids = {u["id"] for u in r.json()["users"]}
    assert user_a.id in ids
    assert user_b.id not in ids

    # Move A into H2 directly (simulating accept-invite)
    await db_session.execute(
        update(User).where(User.id == user_a.id).values(household_id=h2.id)
    )
    await db_session.flush()

    # A's token is unchanged but the next request must reflect H2
    r = await raw_client.get("/api/users", headers=headers)
    assert r.status_code == 200
    ids = {u["id"] for u in r.json()["users"]}
    assert user_b.id in ids
    assert user_a.id in ids


@pytest.mark.asyncio
async def test_legacy_token_with_household_claim_still_accepted(
    raw_client: AsyncClient, db_session: AsyncSession
) -> None:
    """A token issued before the change (with household_id claim) keeps
    working — the claim is ignored, household is resolved from the user row."""
    user_a, _user_b, _h1, _h2 = await _seed_two_households_two_users(db_session)

    # Legacy-shaped token: encode a payload that includes household_id
    # (mirrors what a token issued before phase B looks like).
    from datetime import UTC, datetime, timedelta

    import jwt as pyjwt

    now = datetime.now(UTC)
    legacy_token = pyjwt.encode(
        {
            "sub": user_a.id,
            "household_id": "some-stale-household-id",
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(days=30)).timestamp()),
        },
        settings.jwt_signing_secret,
        algorithm="HS256",
    )
    r = await raw_client.get(
        "/api/users", headers={"Authorization": f"Bearer {legacy_token}"}
    )
    assert r.status_code == 200
