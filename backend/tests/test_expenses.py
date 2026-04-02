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


# --- Stats tests ---


async def _seed_for_stats(db: AsyncSession):
    txns = [
        Transaction(
            id="st1",
            date=date(2024, 1, 15),
            description="Groceries",
            category="Food",
            amount=Decimal("50.00"),
            type="expense",
            user_id="alice",
            labels=[],
            metadata_={},
        ),
        Transaction(
            id="st2",
            date=date(2024, 1, 20),
            description="Restaurant",
            category="Food",
            amount=Decimal("30.00"),
            type="expense",
            user_id="alice",
            labels=[],
            metadata_={},
        ),
        Transaction(
            id="st3",
            date=date(2024, 2, 1),
            description="Salary",
            category="Income",
            amount=Decimal("3000.00"),
            type="income",
            user_id="alice",
            labels=[],
            metadata_={},
        ),
        Transaction(
            id="st4",
            date=date(2024, 2, 5),
            description="Rent",
            category="Housing",
            amount=Decimal("1200.00"),
            type="expense",
            user_id="alice",
            labels=[],
            metadata_={},
        ),
        # Excluded transaction — should not appear in stats
        Transaction(
            id="st5",
            date=date(2024, 1, 25),
            description="Excluded",
            category="Food",
            amount=Decimal("999.00"),
            type="expense",
            user_id="alice",
            labels=[],
            metadata_={},
            excluded_from_calculations=True,
        ),
    ]
    db.add_all(txns)
    await db.flush()


@pytest.mark.asyncio
async def test_get_stats_totals(client: AsyncClient, db_session: AsyncSession):
    await _seed_for_stats(db_session)
    response = await client.get(
        "/api/stats",
        params={"dateFrom": "2024-01-01", "dateTo": "2024-12-31"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["totalExpenses"] == pytest.approx(1280.0)  # 50+30+1200, not 999
    assert data["totalIncome"] == pytest.approx(3000.0)
    assert data["netAmount"] == pytest.approx(3000.0 - 1280.0)


@pytest.mark.asyncio
async def test_get_stats_category_breakdown(
    client: AsyncClient, db_session: AsyncSession
):
    await _seed_for_stats(db_session)
    response = await client.get(
        "/api/stats",
        params={"dateFrom": "2024-01-01", "dateTo": "2024-12-31"},
    )
    data = response.json()
    assert data["categoryBreakdown"]["Food"] == pytest.approx(80.0)
    assert data["categoryBreakdown"]["Housing"] == pytest.approx(1200.0)


@pytest.mark.asyncio
async def test_get_stats_monthly_data(client: AsyncClient, db_session: AsyncSession):
    await _seed_for_stats(db_session)
    response = await client.get(
        "/api/stats",
        params={"dateFrom": "2024-01-01", "dateTo": "2024-12-31"},
    )
    data = response.json()
    assert len(data["monthlyData"]) == 2  # Jan and Feb
    jan = next(m for m in data["monthlyData"] if "Jan" in m["month"])
    assert jan["expenses"] == pytest.approx(80.0)
    assert jan["income"] == pytest.approx(0.0)


@pytest.mark.asyncio
async def test_get_stats_top_expenses(client: AsyncClient, db_session: AsyncSession):
    await _seed_for_stats(db_session)
    response = await client.get(
        "/api/stats",
        params={"dateFrom": "2024-01-01", "dateTo": "2024-12-31"},
    )
    data = response.json()
    assert len(data["topExpenses"]) <= 10
    # Rent is largest
    assert data["topExpenses"][0]["description"] == "Rent"
    assert data["topExpenses"][0]["amount"] == pytest.approx(1200.0)


@pytest.mark.asyncio
async def test_get_stats_response_shape(client: AsyncClient, db_session: AsyncSession):
    await _seed_for_stats(db_session)
    response = await client.get(
        "/api/stats",
        params={"dateFrom": "2024-01-01", "dateTo": "2024-12-31"},
    )
    data = response.json()
    required_keys = {
        "totalExpenses",
        "totalIncome",
        "netAmount",
        "categoryBreakdown",
        "incomeCategoryBreakdown",
        "monthlyData",
        "monthlyCategoryData",
        "topExpenses",
        "topIncome",
    }
    assert required_keys.issubset(set(data.keys()))
