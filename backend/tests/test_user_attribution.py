"""Client-supplied user ids must belong to the caller's household."""

from datetime import date
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Household, Transaction, User


@pytest.fixture
async def other_household_user(db_session: AsyncSession) -> str:
    db_session.add(Household(id="house-other", name="Other"))
    await db_session.flush()
    db_session.add(
        User(
            id="u-other",
            name="Other",
            email="other@test.local",
            password_hash="",
            household_id="house-other",
        )
    )
    await db_session.flush()
    return "u-other"


def _expense(id_: str, user: str | None) -> dict:
    return {
        "id": id_,
        "date": "2024-06-01",
        "description": "Test",
        "category": "Food",
        "amount": 10.0,
        "type": "expense",
        "user": user,
    }


@pytest.mark.asyncio
async def test_bulk_save_rejects_user_from_other_household(
    client: AsyncClient, other_household_user: str
):
    response = await client.post(
        "/api/expenses", json={"expenses": [_expense("e1", other_household_user)]}
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Unknown user for this household"


@pytest.mark.asyncio
async def test_bulk_save_keeps_attribution_of_departed_member(
    client: AsyncClient, db_session: AsyncSession
):
    # A member who left still owns their old rows; re-saving them must work.
    db_session.add(
        Transaction(
            id="old1",
            date=date(2024, 5, 1),
            description="Old",
            category="Food",
            amount=Decimal("5"),
            type="expense",
            created_by_user_id="u-departed",
        )
    )
    await db_session.flush()

    response = await client.post(
        "/api/expenses",
        json={
            "expenses": [
                _expense("old1", "u-departed"),
                _expense("new1", "default-user"),
            ]
        },
    )
    assert response.status_code == 200, response.text


@pytest.mark.asyncio
async def test_patch_rejects_user_from_other_household(
    client: AsyncClient, db_session: AsyncSession, other_household_user: str
):
    db_session.add(
        Transaction(
            id="t1",
            date=date(2024, 5, 1),
            description="Coffee",
            category="Food",
            amount=Decimal("5"),
            type="expense",
            created_by_user_id="default-user",
        )
    )
    await db_session.flush()

    response = await client.patch(
        "/api/expenses/t1", json={"user": other_household_user}
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_import_csv_rejects_user_from_other_household(
    client: AsyncClient, other_household_user: str
):
    response = await client.post(
        "/api/import-csv",
        json={
            "csvText": (
                "Date,Description,Category,Amount\n2024-01-15,Coffee,Food,-4.50\n"
            ),
            "userId": other_household_user,
        },
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_create_account_rejects_user_from_other_household(
    client: AsyncClient, other_household_user: str
):
    response = await client.post(
        "/api/accounts",
        json={
            "id": "a1",
            "userId": other_household_user,
            "name": "Checking",
            "type": "asset",
        },
    )
    assert response.status_code == 400
