"""Stats and dashboard reads use counted (effective) amounts."""

from datetime import date
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import Transaction
from app.utils.transfer_groups import create_group

HH = "household-default"
JAN = {"dateFrom": "2024-01-01", "dateTo": "2024-01-31"}


def _txn(tid, amount, typ, d, user="alice", **kw):
    return Transaction(
        id=tid,
        date=d,
        description=tid,
        category=kw.pop("category", "Transfers"),
        amount=Decimal(amount),
        type=typ,
        household_id=HH,
        created_by_user_id=user,
        labels=[],
        metadata_={},
        **kw,
    )


async def _seed(db: AsyncSession, anchor_amount: str, member_user: str = "alice"):
    db.add(_txn("pay", anchor_amount, "income", date(2024, 1, 1)))
    for i in range(5):
        db.add(_txn(f"v{i}", "900.00", "expense", date(2024, 1, 2 + i), member_user))
    await db.flush()
    await create_group(db, HH, "pay", [f"v{i}" for i in range(5)])


@pytest.mark.asyncio
async def test_stats_anchor_keeps_remainder(client: AsyncClient, db_session):
    await _seed(db_session, "5000.00")
    data = (await client.get("/api/stats", params=JAN)).json()
    assert data["totalIncome"] == pytest.approx(500.0)
    assert data["totalExpenses"] == pytest.approx(0.0)
    assert data["topExpenses"] == []
    assert data["topIncome"][0]["amount"] == pytest.approx(5000.0)
    assert data["topIncome"][0]["effectiveAmount"] == pytest.approx(500.0)


@pytest.mark.asyncio
async def test_stats_member_keeps_remainder(client: AsyncClient, db_session):
    await _seed(db_session, "4000.00")
    data = (await client.get("/api/stats", params=JAN)).json()
    assert data["totalIncome"] == pytest.approx(0.0)
    assert data["totalExpenses"] == pytest.approx(500.0)
    assert data["categoryBreakdown"] == {"Transfers": pytest.approx(500.0)}
    [top] = data["topExpenses"]
    assert top["id"] == "v0"
    assert top["amount"] == pytest.approx(900.0)
    assert top["effectiveAmount"] == pytest.approx(500.0)


@pytest.mark.asyncio
async def test_stats_ungrouped_rows_have_no_effective_amount(
    client: AsyncClient, db_session
):
    db_session.add(_txn("coffee", "4.50", "expense", date(2024, 1, 3), category="Food"))
    await db_session.flush()
    data = (await client.get("/api/stats", params=JAN)).json()
    assert data["topExpenses"][0]["effectiveAmount"] is None


@pytest.mark.asyncio
async def test_stats_user_group_counts_raw_amounts_with_user_filter(
    client: AsyncClient, db_session
):
    await _seed(db_session, "5000.00", member_user="bob")
    unfiltered = (await client.get("/api/stats", params=JAN)).json()
    assert unfiltered["totalIncome"] == pytest.approx(500.0)
    assert unfiltered["totalExpenses"] == pytest.approx(0.0)

    bob = (await client.get("/api/stats", params={**JAN, "userId": "bob"})).json()
    assert bob["totalExpenses"] == pytest.approx(4500.0)


@pytest.mark.asyncio
async def test_stats_still_skips_manually_excluded(client: AsyncClient, db_session):
    await _seed(db_session, "4000.00")
    v0 = await db_session.get(Transaction, "v0")
    assert v0 is not None
    v0.excluded_from_calculations = True
    await db_session.flush()
    data = (await client.get("/api/stats", params=JAN)).json()
    assert data["totalExpenses"] == pytest.approx(0.0)


@pytest.mark.asyncio
async def test_chart_preview_sums_counted_amounts(client: AsyncClient, db_session):
    await _seed(db_session, "4000.00")
    response = await client.post(
        "/api/dashboard-panels/chart-preview",
        json={"filterGroups": [], **JAN},
    )
    rows = response.json()["rows"]
    assert [(r["type"], r["total"]) for r in rows] == [("expense", 500.0)]


@pytest.mark.asyncio
async def test_panel_preview_lists_partial_rows_only(client: AsyncClient, db_session):
    await _seed(db_session, "4000.00")
    response = await client.post(
        "/api/dashboard-panels/preview",
        json={"filterGroups": [], **JAN, "limit": 50, "offset": 0},
    )
    data = response.json()
    assert data["total"] == 1
    [row] = data["transactions"]
    assert row["id"] == "v0"
    assert row["amount"] == pytest.approx(900.0)
    assert row["effectiveAmount"] == pytest.approx(500.0)
