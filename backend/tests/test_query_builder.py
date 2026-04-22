from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import Transaction
from app.utils.query_builder import (
    build_expenses_filter,
    build_filter_groups_clause,
    build_month_series,
    build_panel_data_query,
    build_stats_filter,
)


async def _seed_transactions(db: AsyncSession):
    """Seed a small set of transactions for filter tests."""
    txns = [
        Transaction(
            id="t1",
            date=date(2024, 1, 15),
            description="Groceries at Walmart",
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
            description="Salary deposit",
            category="Income",
            amount=Decimal("3000.00"),
            type="income",
            user_id="bob",
            labels=["recurring"],
            metadata_={"sourceId": "src2"},
        ),
        Transaction(
            id="t3",
            date=date(2024, 1, 20),
            description="Transfer to savings",
            category="Transfer",
            amount=Decimal("500.00"),
            type="expense",
            user_id="alice",
            labels=[],
            metadata_={"sourceId": "src1"},
        ),
        Transaction(
            id="t4",
            date=date(2024, 3, 5),
            description="Coffee shop",
            category="Food",
            amount=Decimal("5.50"),
            type="expense",
            user_id="alice",
            labels=["small"],
            metadata_={},
        ),
    ]
    db.add_all(txns)
    await db.flush()


@pytest.mark.asyncio
async def test_no_filters_returns_all(db_session: AsyncSession):
    await _seed_transactions(db_session)
    stmt = select(Transaction)
    filters = build_expenses_filter({})
    stmt = stmt.where(*filters)
    result = await db_session.execute(stmt)
    assert len(result.scalars().all()) == 4


@pytest.mark.asyncio
async def test_date_range_filter(db_session: AsyncSession):
    await _seed_transactions(db_session)
    stmt = select(Transaction)
    filters = build_expenses_filter({"dateFrom": "2024-01-01", "dateTo": "2024-01-31"})
    stmt = stmt.where(*filters)
    result = await db_session.execute(stmt)
    rows = result.scalars().all()
    assert len(rows) == 2
    assert {r.id for r in rows} == {"t1", "t3"}


@pytest.mark.asyncio
async def test_user_filter(db_session: AsyncSession):
    await _seed_transactions(db_session)
    stmt = select(Transaction)
    filters = build_expenses_filter({"userId": "bob"})
    stmt = stmt.where(*filters)
    result = await db_session.execute(stmt)
    rows = result.scalars().all()
    assert len(rows) == 1
    assert rows[0].id == "t2"


@pytest.mark.asyncio
async def test_categories_filter(db_session: AsyncSession):
    await _seed_transactions(db_session)
    stmt = select(Transaction)
    filters = build_expenses_filter({"categories": ["Food"]})
    stmt = stmt.where(*filters)
    result = await db_session.execute(stmt)
    rows = result.scalars().all()
    assert len(rows) == 2
    assert {r.id for r in rows} == {"t1", "t4"}


@pytest.mark.asyncio
async def test_types_filter(db_session: AsyncSession):
    await _seed_transactions(db_session)
    stmt = select(Transaction)
    filters = build_expenses_filter({"types": ["income"]})
    stmt = stmt.where(*filters)
    result = await db_session.execute(stmt)
    rows = result.scalars().all()
    assert len(rows) == 1
    assert rows[0].id == "t2"


@pytest.mark.asyncio
async def test_amount_range_filter(db_session: AsyncSession):
    await _seed_transactions(db_session)
    stmt = select(Transaction)
    filters = build_expenses_filter({"minAmount": "10", "maxAmount": "100"})
    stmt = stmt.where(*filters)
    result = await db_session.execute(stmt)
    rows = result.scalars().all()
    assert len(rows) == 1
    assert rows[0].id == "t1"


@pytest.mark.asyncio
async def test_search_filter(db_session: AsyncSession):
    await _seed_transactions(db_session)
    stmt = select(Transaction)
    filters = build_expenses_filter({"search": "walmart"})
    stmt = stmt.where(*filters)
    result = await db_session.execute(stmt)
    rows = result.scalars().all()
    assert len(rows) == 1
    assert rows[0].id == "t1"


@pytest.mark.asyncio
async def test_labels_filter(db_session: AsyncSession):
    await _seed_transactions(db_session)
    stmt = select(Transaction)
    filters = build_expenses_filter({"labels": ["essential"]})
    stmt = stmt.where(*filters)
    result = await db_session.execute(stmt)
    rows = result.scalars().all()
    assert len(rows) == 1
    assert rows[0].id == "t1"


@pytest.mark.asyncio
async def test_sources_filter(db_session: AsyncSession):
    await _seed_transactions(db_session)
    stmt = select(Transaction)
    filters = build_expenses_filter({"sources": ["src2"]})
    stmt = stmt.where(*filters)
    result = await db_session.execute(stmt)
    rows = result.scalars().all()
    assert len(rows) == 1
    assert rows[0].id == "t2"


@pytest.mark.asyncio
async def test_combined_filters(db_session: AsyncSession):
    await _seed_transactions(db_session)
    stmt = select(Transaction)
    filters = build_expenses_filter(
        {
            "dateFrom": "2024-01-01",
            "dateTo": "2024-01-31",
            "userId": "alice",
            "types": ["expense"],
        }
    )
    stmt = stmt.where(*filters)
    result = await db_session.execute(stmt)
    rows = result.scalars().all()
    assert len(rows) == 2
    assert {r.id for r in rows} == {"t1", "t3"}


# --- Stats filter tests ---


async def _seed_stats_transactions(db: AsyncSession):
    """Seed transactions with various transfer_info states for stats filter tests."""
    txns = [
        # Normal expense — should be included
        Transaction(
            id="s1",
            date=date(2024, 1, 15),
            description="Groceries",
            category="Food",
            amount=Decimal("50.00"),
            type="expense",
            user_id="alice",
            labels=[],
            metadata_={},
        ),
        # Excluded from calculations — should be excluded
        Transaction(
            id="s2",
            date=date(2024, 1, 16),
            description="Excluded item",
            category="Food",
            amount=Decimal("25.00"),
            type="expense",
            user_id="alice",
            labels=[],
            metadata_={},
            excluded_from_calculations=True,
        ),
        # Transfer with no user override — should be excluded
        Transaction(
            id="s3",
            date=date(2024, 1, 17),
            description="Transfer out",
            category="Transfer",
            amount=Decimal("100.00"),
            type="expense",
            user_id="alice",
            labels=[],
            metadata_={},
            transfer_info={
                "isTransfer": True,
                "transferId": "tf1",
                "transferType": "self",
                "excludedFromCalculations": True,
                "userOverride": False,
            },
        ),
        # Transfer with user override, included — should be included
        Transaction(
            id="s4",
            date=date(2024, 1, 18),
            description="Override included",
            category="Transfer",
            amount=Decimal("200.00"),
            type="expense",
            user_id="alice",
            labels=[],
            metadata_={},
            transfer_info={
                "isTransfer": True,
                "transferId": "tf2",
                "transferType": "self",
                "excludedFromCalculations": False,
                "userOverride": True,
            },
        ),
        # Normal income — should be included
        Transaction(
            id="s5",
            date=date(2024, 2, 1),
            description="Salary",
            category="Income",
            amount=Decimal("3000.00"),
            type="income",
            user_id="alice",
            labels=[],
            metadata_={},
        ),
        # User-type transfer — should be included when userId is specified
        Transaction(
            id="s6",
            date=date(2024, 1, 20),
            description="User transfer",
            category="Transfer",
            amount=Decimal("150.00"),
            type="expense",
            user_id="bob",
            labels=[],
            metadata_={},
            transfer_info={
                "isTransfer": True,
                "transferId": "tf3",
                "transferType": "user",
                "excludedFromCalculations": True,
                "userOverride": False,
            },
        ),
    ]
    db.add_all(txns)
    await db.flush()


@pytest.mark.asyncio
async def test_stats_filter_excludes_excluded_transactions(db_session: AsyncSession):
    await _seed_stats_transactions(db_session)
    stmt = select(Transaction)
    filters = build_stats_filter(None, None, None)
    stmt = stmt.where(*filters)
    result = await db_session.execute(stmt)
    rows = result.scalars().all()
    ids = {r.id for r in rows}
    # s2 (excluded_from_calculations) must be excluded
    assert "s2" not in ids
    # s1 (normal) and s5 (income) must be included
    assert "s1" in ids
    assert "s5" in ids


@pytest.mark.asyncio
async def test_stats_filter_excludes_unoverridden_transfers(db_session: AsyncSession):
    await _seed_stats_transactions(db_session)
    stmt = select(Transaction)
    filters = build_stats_filter(None, None, None)
    stmt = stmt.where(*filters)
    result = await db_session.execute(stmt)
    rows = result.scalars().all()
    ids = {r.id for r in rows}
    # s3 (self transfer, excluded, no override) must be excluded
    assert "s3" not in ids


@pytest.mark.asyncio
async def test_stats_filter_includes_overridden_transfer(db_session: AsyncSession):
    await _seed_stats_transactions(db_session)
    stmt = select(Transaction)
    filters = build_stats_filter(None, None, None)
    stmt = stmt.where(*filters)
    result = await db_session.execute(stmt)
    rows = result.scalars().all()
    ids = {r.id for r in rows}
    # s4 (user override, not excluded from calc) must be included
    assert "s4" in ids


@pytest.mark.asyncio
async def test_stats_filter_date_range(db_session: AsyncSession):
    await _seed_stats_transactions(db_session)
    stmt = select(Transaction)
    filters = build_stats_filter("2024-01-01", "2024-01-31", None)
    stmt = stmt.where(*filters)
    result = await db_session.execute(stmt)
    rows = result.scalars().all()
    # s5 is Feb, should be excluded
    ids = {r.id for r in rows}
    assert "s5" not in ids


@pytest.mark.asyncio
async def test_stats_filter_user_type_transfer_with_userid(db_session: AsyncSession):
    await _seed_stats_transactions(db_session)
    stmt = select(Transaction)
    filters = build_stats_filter(None, None, "bob")
    stmt = stmt.where(*filters)
    result = await db_session.execute(stmt)
    rows = result.scalars().all()
    ids = {r.id for r in rows}
    # s6 is user-type transfer with userId specified — should be included
    assert "s6" in ids


# --- Filter groups tests ---


@pytest.mark.asyncio
async def test_filter_groups_type_condition(db_session: AsyncSession):
    await _seed_transactions(db_session)
    filter_groups = [
        {"conditions": [{"field": "type", "operator": "is", "value": "income"}]}
    ]
    stmt = select(Transaction)
    clause = build_filter_groups_clause(filter_groups)
    if clause is not None:
        stmt = stmt.where(clause)
    result = await db_session.execute(stmt)
    rows = result.scalars().all()
    assert len(rows) == 1
    assert rows[0].id == "t2"


@pytest.mark.asyncio
async def test_filter_groups_category_is(db_session: AsyncSession):
    await _seed_transactions(db_session)
    filter_groups = [
        {"conditions": [{"field": "category", "operator": "is", "value": ["Food"]}]}
    ]
    stmt = select(Transaction)
    clause = build_filter_groups_clause(filter_groups)
    if clause is not None:
        stmt = stmt.where(clause)
    result = await db_session.execute(stmt)
    rows = result.scalars().all()
    assert len(rows) == 2
    assert {r.id for r in rows} == {"t1", "t4"}


@pytest.mark.asyncio
async def test_filter_groups_category_not(db_session: AsyncSession):
    await _seed_transactions(db_session)
    filter_groups = [
        {"conditions": [{"field": "category", "operator": "not", "value": ["Food"]}]}
    ]
    stmt = select(Transaction)
    clause = build_filter_groups_clause(filter_groups)
    if clause is not None:
        stmt = stmt.where(clause)
    result = await db_session.execute(stmt)
    rows = result.scalars().all()
    assert {r.id for r in rows} == {"t2", "t3"}


@pytest.mark.asyncio
async def test_filter_groups_labels_includes(db_session: AsyncSession):
    await _seed_transactions(db_session)
    filter_groups = [
        {
            "conditions": [
                {
                    "field": "labels",
                    "operator": "includes",
                    "value": ["essential"],
                }
            ]
        }
    ]
    stmt = select(Transaction)
    clause = build_filter_groups_clause(filter_groups)
    if clause is not None:
        stmt = stmt.where(clause)
    result = await db_session.execute(stmt)
    rows = result.scalars().all()
    assert len(rows) == 1
    assert rows[0].id == "t1"


@pytest.mark.asyncio
async def test_filter_groups_description_matches(db_session: AsyncSession):
    await _seed_transactions(db_session)
    filter_groups = [
        {
            "conditions": [
                {
                    "field": "description",
                    "operator": "matches",
                    "value": "(?i)coffee",
                }
            ]
        }
    ]
    stmt = select(Transaction)
    clause = build_filter_groups_clause(filter_groups)
    if clause is not None:
        stmt = stmt.where(clause)
    result = await db_session.execute(stmt)
    rows = result.scalars().all()
    assert len(rows) == 1
    assert rows[0].id == "t4"


@pytest.mark.asyncio
async def test_filter_groups_amount_gte_lte(db_session: AsyncSession):
    await _seed_transactions(db_session)
    filter_groups = [
        {
            "conditions": [
                {"field": "amount", "operator": "gte", "value": "10"},
                {"field": "amount", "operator": "lte", "value": "100"},
            ]
        }
    ]
    stmt = select(Transaction)
    clause = build_filter_groups_clause(filter_groups)
    if clause is not None:
        stmt = stmt.where(clause)
    result = await db_session.execute(stmt)
    rows = result.scalars().all()
    assert len(rows) == 1
    assert rows[0].id == "t1"


@pytest.mark.asyncio
async def test_filter_groups_or_logic(db_session: AsyncSession):
    """Multiple groups are OR'd together."""
    await _seed_transactions(db_session)
    filter_groups = [
        {"conditions": [{"field": "type", "operator": "is", "value": "income"}]},
        {
            "conditions": [
                {"field": "category", "operator": "is", "value": ["Transfer"]}
            ]
        },
    ]
    stmt = select(Transaction)
    clause = build_filter_groups_clause(filter_groups)
    if clause is not None:
        stmt = stmt.where(clause)
    result = await db_session.execute(stmt)
    rows = result.scalars().all()
    assert {r.id for r in rows} == {"t2", "t3"}


@pytest.mark.asyncio
async def test_filter_groups_empty_returns_none(db_session: AsyncSession):
    clause = build_filter_groups_clause([])
    assert clause is None
    clause = build_filter_groups_clause(None)
    assert clause is None


def test_build_month_series():
    result = build_month_series("2024-01-15", "2024-03-20")
    assert "2024-01" in result
    assert "2024-02" in result
    assert "2024-03" in result
    assert len(result) == 3
    assert result["2024-01"]["month"] == "Jan 2024"
    assert result["2024-03"]["month"] == "Mar 2024"


def test_build_month_series_single_month():
    result = build_month_series("2024-06-01", "2024-06-30")
    assert len(result) == 1
    assert result["2024-06"]["month"] == "Jun 2024"


# --- Panel data query tests ---


class TestBuildPanelDataQuery:
    def test_returns_query_and_filters(self):
        stmt, filters = build_panel_data_query(
            date_from="2024-01-01",
            date_to="2024-06-30",
            user_id=None,
            filter_groups=[],
        )
        assert stmt is not None
        assert isinstance(filters, list)

    def test_with_filter_groups(self):
        groups = [
            {"conditions": [{"field": "type", "operator": "is", "value": "expense"}]}
        ]
        stmt, filters = build_panel_data_query(
            date_from="2024-01-01",
            date_to="2024-06-30",
            user_id=None,
            filter_groups=groups,
        )
        assert stmt is not None
        assert len(filters) > 0

    @pytest.mark.asyncio
    async def test_executes_and_returns_rows(self, db_session: AsyncSession):
        await _seed_transactions(db_session)
        stmt, _ = build_panel_data_query(
            date_from="2024-01-01",
            date_to="2024-03-31",
            user_id=None,
            filter_groups=[],
        )
        result = await db_session.execute(stmt)
        rows = result.all()
        assert len(rows) > 0
        # Each row should have sort_month, month, type, total
        row = rows[0]
        assert hasattr(row, "sort_month")
        assert hasattr(row, "month")
        assert hasattr(row, "type")
        assert hasattr(row, "total")
