"""Household rename + /me/summary + member removal."""

from datetime import date
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
    Household,
    Report,
    Source,
    Transaction,
    User,
)
from app.utils.passwords import hash_password
from tests.conftest import auth_headers


@pytest.fixture(autouse=True)
def _disable_demo(monkeypatch):
    monkeypatch.setattr(settings, "finance_manager_demo_mode", False)
    monkeypatch.setattr(settings, "jwt_signing_secret", "test-secret")
    monkeypatch.setattr(settings, "jwt_access_token_ttl_days", 30)


# ---------------------------------------------------------------------------
# PATCH /api/households/{id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_rename_household(
    raw_client: AsyncClient,
    db_session: AsyncSession,
    signed_in_user,
):
    _user, household, token = signed_in_user
    r = await raw_client.patch(
        f"/api/households/{household.id}",
        headers=auth_headers(token),
        json={"name": "Smith Family"},
    )
    assert r.status_code == 200, r.text
    refreshed = (
        await db_session.execute(
            select(Household).where(Household.id == household.id)
        )
    ).scalar_one()
    assert refreshed.name == "Smith Family"


@pytest.mark.asyncio
async def test_rename_other_household_returns_404(
    raw_client: AsyncClient, two_households_two_users
):
    _user_a, _user_b, _h1, h2, token_a = two_households_two_users
    r = await raw_client.patch(
        f"/api/households/{h2.id}",
        headers=auth_headers(token_a),
        json={"name": "Hacked"},
    )
    assert r.status_code == 404


@pytest.mark.parametrize("bad_name", ["", "   ", "x" * 200])
@pytest.mark.asyncio
async def test_rename_validation(
    raw_client: AsyncClient, signed_in_user, bad_name: str
):
    _user, household, token = signed_in_user
    r = await raw_client.patch(
        f"/api/households/{household.id}",
        headers=auth_headers(token),
        json={"name": bad_name},
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_rename_503_in_demo_mode(
    raw_client: AsyncClient,
    db_session: AsyncSession,
    demo_mode_enabled,
):
    # Demo mode needs the demo user to exist for get_current_user.
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

    r = await raw_client.patch(
        f"/api/households/{settings.demo_household_id}",
        json={"name": "x"},
    )
    assert r.status_code == 503


@pytest.mark.asyncio
async def test_summary_returns_counts(
    raw_client: AsyncClient,
    db_session: AsyncSession,
    signed_in_user,
):
    user, household, token = signed_in_user

    db_session.add_all(
        [
            Account(
                id="acc-sum-1",
                name="Checking",
                type="asset",
                household_id=household.id,
                created_by_user_id=user.id,
            ),
            Account(
                id="acc-sum-2",
                name="Savings",
                type="asset",
                household_id=household.id,
                created_by_user_id=user.id,
            ),
            Category(id="cat-sum", name="Food", household_id=household.id),
            Source(id="src-sum", name="Manual", household_id=household.id),
            Dashboard(
                id="dash-sum",
                name="Main",
                household_id=household.id,
                date_range_start=date(2026, 1, 1),
                date_range_end=date(2026, 12, 31),
            ),
            Report(id="rep-sum", name="Spend", household_id=household.id),
        ]
    )
    await db_session.flush()
    db_session.add(
        Transaction(
            id="txn-sum",
            date=date(2026, 4, 15),
            description="Coffee",
            category="Food",
            amount=Decimal("3.50"),
            type="expense",
            household_id=household.id,
            created_by_user_id=user.id,
        )
    )
    await db_session.flush()

    r = await raw_client.get(
        "/api/households/me/summary", headers=auth_headers(token)
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body == {
        "transactions": 1,
        "accounts": 2,
        "categories": 1,
        "sources": 1,
        "dashboards": 1,
        "reports": 1,
    }


@pytest.mark.asyncio
async def test_summary_returns_zeros_for_empty(
    raw_client: AsyncClient, signed_in_user
):
    _user, _h, token = signed_in_user
    r = await raw_client.get(
        "/api/households/me/summary", headers=auth_headers(token)
    )
    assert r.status_code == 200
    body = r.json()
    assert body == {
        "transactions": 0,
        "accounts": 0,
        "categories": 0,
        "sources": 0,
        "dashboards": 0,
        "reports": 0,
    }
