from datetime import date
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import Transaction


async def _seed(db: AsyncSession):
    txns = [
        Transaction(
            id="t1",
            date=date(2024, 1, 15),
            description="Groceries",
            category="Food",
            amount=Decimal("50.00"),
            type="expense",
            user_id="alice",
            labels=["essential"],
            metadata_={"sourceId": "src1"},
        ),
        Transaction(
            id="t2",
            date=date(2024, 2, 10),
            description="Salary",
            category="Income",
            amount=Decimal("3000.00"),
            type="income",
            user_id="bob",
            labels=[],
            metadata_={"sourceId": "src2"},
        ),
        Transaction(
            id="t3",
            date=date(2024, 1, 20),
            description="Coffee",
            category="Food",
            amount=Decimal("5.50"),
            type="expense",
            user_id="alice",
            labels=[],
            metadata_={},
        ),
    ]
    db.add_all(txns)
    await db.flush()


@pytest.mark.asyncio
async def test_get_expenses_unpaginated(client: AsyncClient, db_session: AsyncSession):
    await _seed(db_session)
    response = await client.get("/api/expenses")
    assert response.status_code == 200
    data = response.json()
    # No limit → returns bare array, ordered by date DESC
    assert isinstance(data, list)
    assert len(data) == 3
    assert data[0]["id"] == "t2"  # Feb 10 is latest


@pytest.mark.asyncio
async def test_get_expenses_paginated(client: AsyncClient, db_session: AsyncSession):
    await _seed(db_session)
    response = await client.get("/api/expenses", params={"limit": 2, "offset": 0})
    assert response.status_code == 200
    data = response.json()
    assert "expenses" in data
    assert "total" in data
    assert data["total"] == 3
    assert len(data["expenses"]) == 2


@pytest.mark.asyncio
async def test_get_expenses_with_date_filter(
    client: AsyncClient, db_session: AsyncSession
):
    await _seed(db_session)
    response = await client.get(
        "/api/expenses",
        params={"dateFrom": "2024-01-01", "dateTo": "2024-01-31"},
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2


@pytest.mark.asyncio
async def test_get_expenses_with_user_filter(
    client: AsyncClient, db_session: AsyncSession
):
    await _seed(db_session)
    response = await client.get("/api/expenses", params={"userId": "alice"})
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2


@pytest.mark.asyncio
async def test_get_expenses_with_search(client: AsyncClient, db_session: AsyncSession):
    await _seed(db_session)
    response = await client.get("/api/expenses", params={"search": "grocer"})
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == "t1"


@pytest.mark.asyncio
async def test_get_expenses_response_shape(
    client: AsyncClient, db_session: AsyncSession
):
    await _seed(db_session)
    response = await client.get("/api/expenses")
    data = response.json()
    item = data[0]
    # Verify camelCase field names matching Express rowToExpense()
    assert "user" in item  # not user_id
    assert "transferInfo" in item or item.get("transferInfo") is None
    assert "excludedFromCalculations" in item
    assert "importId" in item or item.get("importId") is None
    assert isinstance(item["amount"], float)
    assert isinstance(item["labels"], list)
