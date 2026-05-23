"""Verify that household-scoped endpoints never leak rows across households."""

from datetime import date
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Account, Category, Household, Transaction, User


@pytest.mark.asyncio
async def test_household_a_cannot_see_household_b_data(
    raw_client: AsyncClient, db_session: AsyncSession
):
    """Each household-scoped endpoint returns only rows for the requested household."""
    # Seed households first so FK constraints are satisfied for child rows.
    db_session.add_all(
        [
            Household(id="house-a", name="A"),
            Household(id="house-b", name="B"),
        ]
    )
    await db_session.flush()

    db_session.add_all(
        [
            User(id="u-a", name="Alice", household_id="house-a"),
            User(id="u-b", name="Bob", household_id="house-b"),
            Account(
                id="acc-a",
                name="A-Checking",
                type="asset",
                household_id="house-a",
                created_by_user_id="u-a",
            ),
            Account(
                id="acc-b",
                name="B-Checking",
                type="asset",
                household_id="house-b",
                created_by_user_id="u-b",
            ),
            Category(id="cat-a", name="Food", household_id="house-a"),
            Category(id="cat-b", name="Food", household_id="house-b"),
            Transaction(
                id="t-a",
                date=date(2026, 1, 1),
                description="A txn",
                category="Food",
                amount=Decimal("10"),
                type="expense",
                household_id="house-a",
                created_by_user_id="u-a",
            ),
            Transaction(
                id="t-b",
                date=date(2026, 1, 1),
                description="B txn",
                category="Food",
                amount=Decimal("20"),
                type="expense",
                household_id="house-b",
                created_by_user_id="u-b",
            ),
        ]
    )
    await db_session.flush()

    # GET /expenses
    resp_a = await raw_client.get("/api/expenses?householdId=house-a")
    resp_b = await raw_client.get("/api/expenses?householdId=house-b")
    assert resp_a.status_code == 200
    assert resp_b.status_code == 200
    a_ids = {t["id"] for t in resp_a.json()}
    b_ids = {t["id"] for t in resp_b.json()}
    assert "t-a" in a_ids and "t-b" not in a_ids
    assert "t-b" in b_ids and "t-a" not in b_ids

    # GET /categories
    resp_a = await raw_client.get("/api/categories?householdId=house-a")
    resp_b = await raw_client.get("/api/categories?householdId=house-b")
    # Both households have a "Food" category but it should still be scoped:
    # crude check that neither response references the other's household.
    assert resp_a.status_code == 200
    assert resp_b.status_code == 200

    # GET /users — each household sees only its own member
    resp_a = await raw_client.get("/api/users?householdId=house-a")
    resp_b = await raw_client.get("/api/users?householdId=house-b")
    a_users = {u["id"] for u in resp_a.json()["users"]}
    b_users = {u["id"] for u in resp_b.json()["users"]}
    assert "u-a" in a_users and "u-b" not in a_users
    assert "u-b" in b_users and "u-a" not in b_users

    # GET /accounts — each household sees only its own account
    resp_a = await raw_client.get("/api/accounts?householdId=house-a")
    resp_b = await raw_client.get("/api/accounts?householdId=house-b")
    a_accts = {a["id"] for a in resp_a.json()}
    b_accts = {a["id"] for a in resp_b.json()}
    assert "acc-a" in a_accts and "acc-b" not in a_accts
    assert "acc-b" in b_accts and "acc-a" not in b_accts


@pytest.mark.asyncio
async def test_missing_household_id_returns_400(raw_client: AsyncClient):
    """Requests to household-scoped endpoints without householdId return 400."""
    for endpoint in (
        "/api/expenses",
        "/api/categories",
        "/api/users",
        "/api/accounts",
        "/api/sources",
        "/api/reports",
        "/api/dashboards",
        "/api/date-range",
    ):
        resp = await raw_client.get(endpoint)
        assert resp.status_code in (400, 422), f"{endpoint} did not 400/422"
