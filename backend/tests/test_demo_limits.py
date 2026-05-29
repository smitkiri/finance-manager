"""Unit tests for app.demo.limits helpers + endpoint enforcement tests."""

from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.demo import limits
from app.models import (
    Account,
    AccountBalance,
    Dashboard,
    DashboardPanel,
    Source,
)
from tests.conftest import DEFAULT_TEST_HOUSEHOLD_ID


def test_assert_demo_csv_size_noop_when_demo_off():
    """When demo mode is off, any CSV size is accepted."""
    big = "x" * (settings.demo_max_csv_bytes + 1)
    # Should not raise
    limits.assert_demo_csv_size(big)


def test_assert_demo_csv_size_accepts_at_limit(demo_mode_enabled):
    """A CSV exactly at the byte limit is accepted."""
    csv = "x" * settings.demo_max_csv_bytes
    limits.assert_demo_csv_size(csv)


def test_assert_demo_csv_size_rejects_over_limit(demo_mode_enabled):
    """A CSV one byte over the limit raises 413."""
    csv = "x" * (settings.demo_max_csv_bytes + 1)
    with pytest.raises(HTTPException) as exc:
        limits.assert_demo_csv_size(csv)
    assert exc.value.status_code == 413
    assert "Demo limit" in exc.value.detail


def test_assert_demo_csv_size_counts_utf8_bytes(demo_mode_enabled):
    """Multi-byte chars count their byte width, not char count."""
    # Use 4-byte characters so we go over the byte cap with ~1/4 the chars
    char = "𝄞"  # 4 bytes in UTF-8
    char_count = (settings.demo_max_csv_bytes // 4) + 1
    csv = char * char_count
    assert len(csv) < settings.demo_max_csv_bytes  # by char count, "fits"
    with pytest.raises(HTTPException) as exc:
        limits.assert_demo_csv_size(csv)
    assert exc.value.status_code == 413


def test_assert_demo_replace_count_noop_when_demo_off():
    """When demo mode is off, any size is accepted."""
    limits.assert_demo_replace_count(10_000_000, cap=50, entity="transactions")


def test_assert_demo_replace_count_accepts_at_cap(demo_mode_enabled):
    limits.assert_demo_replace_count(50, cap=50, entity="transactions")


def test_assert_demo_replace_count_rejects_over_cap(demo_mode_enabled):
    with pytest.raises(HTTPException) as exc:
        limits.assert_demo_replace_count(51, cap=50, entity="transactions")
    assert exc.value.status_code == 403
    assert "50" in exc.value.detail
    assert "transactions" in exc.value.detail


async def test_assert_demo_can_add_entity_noop_when_demo_off(db_session: AsyncSession):
    """When demo mode is off, no count query needed; passes silently."""
    # Even if we exceed by far it must not raise
    for i in range(60):
        db_session.add(Source(id=f"s{i}", name=f"src-{i}"))
    await db_session.flush()
    await limits.assert_demo_can_add_entity(
        db_session, Source, DEFAULT_TEST_HOUSEHOLD_ID
    )


async def test_assert_demo_can_add_entity_under_cap(
    db_session: AsyncSession, demo_mode_enabled
):
    """When current count + 1 <= cap, accept silently."""
    for i in range(settings.demo_max_per_entity - 1):
        db_session.add(Source(id=f"s{i}", name=f"src-{i}"))
    await db_session.flush()
    await limits.assert_demo_can_add_entity(
        db_session, Source, DEFAULT_TEST_HOUSEHOLD_ID
    )


async def test_assert_demo_can_add_entity_at_cap_rejects(
    db_session: AsyncSession, demo_mode_enabled
):
    """When current count == cap, adding one more is rejected."""
    for i in range(settings.demo_max_per_entity):
        db_session.add(Source(id=f"s{i}", name=f"src-{i}"))
    await db_session.flush()
    with pytest.raises(HTTPException) as exc:
        await limits.assert_demo_can_add_entity(
            db_session, Source, DEFAULT_TEST_HOUSEHOLD_ID
        )
    assert exc.value.status_code == 403


async def test_assert_demo_can_add_entity_balances_joins_through_account(
    db_session: AsyncSession, demo_mode_enabled
):
    """AccountBalance is scoped via its account's household_id."""
    from datetime import date

    db_session.add(Account(id="a1", name="Checking", type="asset"))
    await db_session.flush()
    for i in range(settings.demo_max_per_entity):
        db_session.add(
            AccountBalance(
                id=f"b{i}", account_id="a1", balance=0, date=date(2026, 1, 1)
            )
        )
    await db_session.flush()
    with pytest.raises(HTTPException) as exc:
        await limits.assert_demo_can_add_entity(
            db_session, AccountBalance, DEFAULT_TEST_HOUSEHOLD_ID
        )
    assert exc.value.status_code == 403


async def test_assert_demo_can_add_entity_panels_joins_through_dashboard(
    db_session: AsyncSession, demo_mode_enabled
):
    """DashboardPanel is scoped via its dashboard's household_id."""
    from datetime import date

    db_session.add(
        Dashboard(
            id="d1",
            name="Default",
            date_range_start=date(2026, 1, 1),
            date_range_end=date(2026, 12, 31),
        )
    )
    await db_session.flush()
    for i in range(settings.demo_max_per_entity):
        db_session.add(
            DashboardPanel(
                id=f"p{i}",
                dashboard_id="d1",
                title=f"P{i}",
                chart_type="bar",
                panel_order=i,
            )
        )
    await db_session.flush()
    with pytest.raises(HTTPException) as exc:
        await limits.assert_demo_can_add_entity(
            db_session, DashboardPanel, DEFAULT_TEST_HOUSEHOLD_ID
        )
    assert exc.value.status_code == 403


def test_refuse_in_demo_mode_noop_when_demo_off():
    """When demo mode is off, this is a no-op."""
    limits.refuse_in_demo_mode()


def test_refuse_in_demo_mode_raises_503_when_demo_on(demo_mode_enabled):
    with pytest.raises(HTTPException) as exc:
        limits.refuse_in_demo_mode()
    assert exc.value.status_code == 503
    assert "demo" in exc.value.detail.lower()
