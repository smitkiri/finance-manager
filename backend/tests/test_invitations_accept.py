"""Accept-invite flow: same-household no-op, mismatch errors, multi-member
old household persists, sole-member old household + all data deleted."""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import (
    Account,
    Category,
    Dashboard,
    DateRange,
    Household,
    Invitation,
    Report,
    Source,
    Transaction,
    User,
)
from app.utils.jwt_tokens import encode_access_token
from app.utils.passwords import hash_password
from tests.conftest import auth_headers


@pytest.fixture(autouse=True)
def _disable_demo(monkeypatch):
    monkeypatch.setattr(settings, "finance_manager_demo_mode", False)
    monkeypatch.setattr(settings, "jwt_signing_secret", "test-secret")
    monkeypatch.setattr(settings, "jwt_access_token_ttl_days", 30)


def _naive_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


async def _seed_user(
    db_session: AsyncSession,
    *,
    user_id: str,
    email: str,
    name: str,
    household_id: str,
) -> User:
    user = User(
        id=user_id,
        name=name,
        email=email,
        password_hash=hash_password("test-pass-12"),
        household_id=household_id,
    )
    db_session.add(user)
    await db_session.flush()
    return user


async def _seed_household(
    db_session: AsyncSession, *, household_id: str, name: str
) -> Household:
    h = Household(id=household_id, name=name)
    db_session.add(h)
    await db_session.flush()
    return h


async def _seed_invitation(
    db_session: AsyncSession,
    *,
    invite_id: str,
    household_id: str,
    email: str,
    token: str,
    invited_by_user_id: str | None = None,
    expires_in: timedelta = timedelta(days=7),
    consumed_at: datetime | None = None,
    revoked_at: datetime | None = None,
) -> Invitation:
    inv = Invitation(
        id=invite_id,
        household_id=household_id,
        email=email,
        token=token,
        invited_by_user_id=invited_by_user_id,
        expires_at=_naive_now() + expires_in,
        consumed_at=consumed_at,
        revoked_at=revoked_at,
    )
    db_session.add(inv)
    await db_session.flush()
    return inv


# ---------------------------------------------------------------------------
# Sole-member: invite acceptance deletes old household + all data
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_accept_moves_user_and_consumes_invite(
    raw_client: AsyncClient, db_session: AsyncSession
):
    h_a = await _seed_household(db_session, household_id="hh-sa-a", name="HA")
    h_b = await _seed_household(db_session, household_id="hh-sa-b", name="HB")
    user_a = await _seed_user(
        db_session,
        user_id="u-sa-a",
        email="alice-sa@example.com",
        name="Alice",
        household_id=h_a.id,
    )
    invite = await _seed_invitation(
        db_session,
        invite_id="inv-sa",
        household_id=h_b.id,
        email=user_a.email,
        token="tok-sa-accept",
    )
    token_a = encode_access_token(user_id=user_a.id)

    r = await raw_client.post(
        "/api/invitations/accept",
        headers=auth_headers(token_a),
        json={"token": invite.token},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["household"]["id"] == h_b.id
    assert body["user"]["id"] == user_a.id

    refreshed = (
        await db_session.execute(select(User).where(User.id == user_a.id))
    ).scalar_one()
    assert refreshed.household_id == h_b.id

    inv = (
        await db_session.execute(select(Invitation).where(Invitation.id == invite.id))
    ).scalar_one()
    assert inv.consumed_at is not None

    assert (
        await db_session.execute(select(Household).where(Household.id == h_a.id))
    ).scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_accept_keeps_old_household_if_other_members(
    raw_client: AsyncClient, db_session: AsyncSession
):
    h_a = await _seed_household(db_session, household_id="hh-km-a", name="HA")
    h_c = await _seed_household(db_session, household_id="hh-km-c", name="HC")
    user_a = await _seed_user(
        db_session,
        user_id="u-km-a",
        email="alice-km@example.com",
        name="Alice",
        household_id=h_a.id,
    )
    user_b = await _seed_user(
        db_session,
        user_id="u-km-b",
        email="bob-km@example.com",
        name="Bob",
        household_id=h_a.id,
    )
    invite = await _seed_invitation(
        db_session,
        invite_id="inv-km",
        household_id=h_c.id,
        email=user_a.email,
        token="tok-km-accept",
    )
    token_a = encode_access_token(user_id=user_a.id)

    r = await raw_client.post(
        "/api/invitations/accept",
        headers=auth_headers(token_a),
        json={"token": invite.token},
    )
    assert r.status_code == 200

    assert (
        await db_session.execute(select(Household).where(Household.id == h_a.id))
    ).scalar_one_or_none() is not None
    b_refreshed = (
        await db_session.execute(select(User).where(User.id == user_b.id))
    ).scalar_one()
    assert b_refreshed.household_id == h_a.id


@pytest.mark.asyncio
async def test_accept_deletes_all_old_household_data(
    raw_client: AsyncClient, db_session: AsyncSession
):
    h_a = await _seed_household(db_session, household_id="hh-wide-a", name="HA")
    h_b = await _seed_household(db_session, household_id="hh-wide-b", name="HB")
    user_a = await _seed_user(
        db_session,
        user_id="u-wide-a",
        email="alice-wide@example.com",
        name="Alice",
        household_id=h_a.id,
    )

    # Seed every household-scoped table
    db_session.add_all(
        [
            Account(
                id="acc-wide",
                name="Checking",
                type="asset",
                household_id=h_a.id,
                created_by_user_id=user_a.id,
            ),
            Category(id="cat-wide", name="Food", household_id=h_a.id),
            Source(id="src-wide", name="Manual", household_id=h_a.id),
            Dashboard(
                id="dash-wide",
                name="Main",
                household_id=h_a.id,
                date_range_start=date(2026, 1, 1),
                date_range_end=date(2026, 12, 31),
            ),
            Report(id="rep-wide", name="My report", household_id=h_a.id),
            DateRange(
                household_id=h_a.id,
                start_date=date(2026, 4, 1),
                end_date=date(2026, 4, 30),
            ),
        ]
    )
    await db_session.flush()
    db_session.add(
        Transaction(
            id="txn-wide",
            date=date(2026, 4, 15),
            description="Coffee",
            category="Food",
            amount=Decimal("3.50"),
            type="expense",
            household_id=h_a.id,
            created_by_user_id=user_a.id,
        )
    )
    await db_session.flush()

    invite = await _seed_invitation(
        db_session,
        invite_id="inv-wide",
        household_id=h_b.id,
        email=user_a.email,
        token="tok-wide-accept",
    )
    token_a = encode_access_token(user_id=user_a.id)

    r = await raw_client.post(
        "/api/invitations/accept",
        headers=auth_headers(token_a),
        json={"token": invite.token},
    )
    assert r.status_code == 200, r.text

    for model in [
        Transaction,
        Account,
        Category,
        Source,
        Dashboard,
        Report,
        DateRange,
    ]:
        rows = (
            (
                await db_session.execute(
                    select(model).where(model.household_id == h_a.id)
                )
            )
            .scalars()
            .all()
        )
        assert rows == [], f"{model.__name__} not cleaned for old household"


@pytest.mark.asyncio
async def test_accept_email_mismatch_returns_403(
    raw_client: AsyncClient, db_session: AsyncSession
):
    h_a = await _seed_household(db_session, household_id="hh-mm-a", name="HA")
    h_b = await _seed_household(db_session, household_id="hh-mm-b", name="HB")
    user_a = await _seed_user(
        db_session,
        user_id="u-mm-a",
        email="alice-mm@example.com",
        name="Alice",
        household_id=h_a.id,
    )
    invite = await _seed_invitation(
        db_session,
        invite_id="inv-mm",
        household_id=h_b.id,
        email="someone-else@example.com",
        token="tok-mm-accept",
    )
    token_a = encode_access_token(user_id=user_a.id)

    r = await raw_client.post(
        "/api/invitations/accept",
        headers=auth_headers(token_a),
        json={"token": invite.token},
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_accept_already_in_target_household_returns_409(
    raw_client: AsyncClient, db_session: AsyncSession
):
    h_a = await _seed_household(db_session, household_id="hh-same-a", name="HA")
    user_a = await _seed_user(
        db_session,
        user_id="u-same-a",
        email="alice-same@example.com",
        name="Alice",
        household_id=h_a.id,
    )
    invite = await _seed_invitation(
        db_session,
        invite_id="inv-same",
        household_id=h_a.id,
        email=user_a.email,
        token="tok-same-accept",
    )
    token_a = encode_access_token(user_id=user_a.id)

    r = await raw_client.post(
        "/api/invitations/accept",
        headers=auth_headers(token_a),
        json={"token": invite.token},
    )
    assert r.status_code == 409

    inv = (
        await db_session.execute(select(Invitation).where(Invitation.id == invite.id))
    ).scalar_one()
    assert inv.consumed_at is None


@pytest.mark.parametrize("inv_state", ["revoked", "consumed", "expired"])
@pytest.mark.asyncio
async def test_accept_inactive_invite_returns_410(
    raw_client: AsyncClient,
    db_session: AsyncSession,
    inv_state: str,
):
    h_a = await _seed_household(
        db_session, household_id=f"hh-st-{inv_state}-a", name="HA"
    )
    h_b = await _seed_household(
        db_session, household_id=f"hh-st-{inv_state}-b", name="HB"
    )
    user_a = await _seed_user(
        db_session,
        user_id=f"u-st-{inv_state}-a",
        email=f"alice-st-{inv_state}@example.com",
        name="Alice",
        household_id=h_a.id,
    )
    now = _naive_now()
    kwargs: dict = {}
    if inv_state == "revoked":
        kwargs["revoked_at"] = now
    elif inv_state == "consumed":
        kwargs["consumed_at"] = now
    elif inv_state == "expired":
        kwargs["expires_in"] = timedelta(hours=-1)
    invite = await _seed_invitation(
        db_session,
        invite_id=f"inv-st-{inv_state}",
        household_id=h_b.id,
        email=user_a.email,
        token=f"tok-st-{inv_state}",
        **kwargs,
    )
    token_a = encode_access_token(user_id=user_a.id)

    r = await raw_client.post(
        "/api/invitations/accept",
        headers=auth_headers(token_a),
        json={"token": invite.token},
    )
    assert r.status_code == 410


@pytest.mark.asyncio
async def test_accept_revokes_users_outgoing_invites_in_old_household(
    raw_client: AsyncClient, db_session: AsyncSession
):
    """Multi-member old household so the wide-DELETE doesn't trigger — the
    outgoing invite issued by A in H_A should be revoked explicitly, not
    cascaded."""
    h_a = await _seed_household(db_session, household_id="hh-out-a", name="HA")
    h_b = await _seed_household(db_session, household_id="hh-out-b", name="HB")
    user_a = await _seed_user(
        db_session,
        user_id="u-out-a",
        email="alice-out@example.com",
        name="Alice",
        household_id=h_a.id,
    )
    # Second member so H_A persists after A leaves
    await _seed_user(
        db_session,
        user_id="u-out-b",
        email="bob-out@example.com",
        name="Bob",
        household_id=h_a.id,
    )
    accept_invite = await _seed_invitation(
        db_session,
        invite_id="inv-out-accept",
        household_id=h_b.id,
        email=user_a.email,
        token="tok-out-accept",
    )
    outgoing = await _seed_invitation(
        db_session,
        invite_id="inv-out-going",
        household_id=h_a.id,
        email="c@example.com",
        token="tok-out-going",
        invited_by_user_id=user_a.id,
    )
    token_a = encode_access_token(user_id=user_a.id)

    r = await raw_client.post(
        "/api/invitations/accept",
        headers=auth_headers(token_a),
        json={"token": accept_invite.token},
    )
    assert r.status_code == 200

    out = (
        await db_session.execute(select(Invitation).where(Invitation.id == outgoing.id))
    ).scalar_one()
    assert out.revoked_at is not None
