"""Unit tests for app.demo.limits helpers + endpoint enforcement tests."""

from __future__ import annotations

import pytest
from fastapi import HTTPException
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.demo import limits
from app.models import (
    Account,
    AccountBalance,
    Dashboard,
    DashboardPanel,
    DateRange,
    Report,
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


# ---------------------------------------------------------------------------
# Endpoint integration tests
# ---------------------------------------------------------------------------


async def test_import_csv_rejects_oversized_body_in_demo_mode(
    client: AsyncClient, demo_mode_with_default_user
):
    """Demo mode: a CSV body over the byte cap is rejected with 413."""
    over_limit = "a" * (settings.demo_max_csv_bytes + 1)
    response = await client.post(
        "/api/import-csv", json={"csvText": over_limit, "fileName": "big.csv"}
    )
    assert response.status_code == 413
    assert "Demo limit" in response.json()["detail"]


async def test_import_csv_accepts_normal_body_in_demo_mode(
    client: AsyncClient, demo_mode_with_default_user
):
    """Demo mode: a small CSV body is accepted."""
    csv = "Date,Description,Category,Amount\n2026-01-01,Coffee,Food,3.50"
    response = await client.post(
        "/api/import-csv", json={"csvText": csv, "fileName": "small.csv"}
    )
    assert response.status_code == 200


async def test_import_csv_no_size_limit_outside_demo_mode(client: AsyncClient):
    """Regression guard: oversize CSVs are accepted when demo mode is off."""
    csv = "Date,Description,Category,Amount\n"
    csv += "2026-01-01,Coffee,Food,3.50\n" * 50_000  # ~1.5 MB of rows
    response = await client.post(
        "/api/import-csv", json={"csvText": csv, "fileName": "large.csv"}
    )
    # Either 200 (parsed and imported) is fine — what matters is that we
    # didn't 413.
    assert response.status_code != 413


async def test_import_csv_rejects_when_merged_exceeds_cap(
    client: AsyncClient,
    demo_mode_with_default_user,
    monkeypatch,
):
    """Demo mode: importing a CSV whose merged result would exceed
    demo_max_transactions is rejected with 403."""
    monkeypatch.setattr(settings, "demo_max_transactions", 3)
    rows = "\n".join(
        f"2026-01-{i:02d},Coffee,Food,3.50"
        for i in range(1, 5)  # 4 distinct rows
    )
    csv = "Date,Description,Category,Amount\n" + rows
    response = await client.post(
        "/api/import-csv", json={"csvText": csv, "fileName": "many.csv"}
    )
    assert response.status_code == 403
    assert "Demo limit" in response.json()["detail"]
    assert "transactions" in response.json()["detail"]


async def test_post_expenses_rejects_when_payload_exceeds_cap(
    client: AsyncClient, demo_mode_with_default_user, monkeypatch
):
    """Demo mode: posting more transactions than the cap is rejected."""
    monkeypatch.setattr(settings, "demo_max_transactions", 2)
    expenses = [
        {
            "id": f"t{i}",
            "date": "2026-01-01",
            "description": f"Item {i}",
            "category": "Food & Drink",
            "amount": 1.0,
            "type": "expense",
        }
        for i in range(3)
    ]
    response = await client.post("/api/expenses", json={"expenses": expenses})
    assert response.status_code == 403
    assert "transactions" in response.json()["detail"]


async def test_post_expenses_accepts_at_cap(
    client: AsyncClient, demo_mode_with_default_user, monkeypatch
):
    """Demo mode: posting exactly cap transactions is accepted."""
    monkeypatch.setattr(settings, "demo_max_transactions", 2)
    expenses = [
        {
            "id": f"t{i}",
            "date": "2026-01-01",
            "description": f"Item {i}",
            "category": "Food & Drink",
            "amount": 1.0,
            "type": "expense",
        }
        for i in range(2)
    ]
    response = await client.post("/api/expenses", json={"expenses": expenses})
    assert response.status_code == 200


async def test_post_categories_rejects_over_cap(
    client: AsyncClient, demo_mode_with_default_user, monkeypatch
):
    """Demo mode: posting more categories than cap is rejected."""
    monkeypatch.setattr(settings, "demo_max_per_entity", 3)
    response = await client.post(
        "/api/categories", json={"categories": ["a", "b", "c", "d"]}
    )
    assert response.status_code == 403
    assert "categories" in response.json()["detail"]


async def test_post_categories_accepts_at_cap(
    client: AsyncClient, demo_mode_with_default_user, monkeypatch
):
    """Demo mode: cap categories accepted exactly."""
    monkeypatch.setattr(settings, "demo_max_per_entity", 3)
    response = await client.post(
        "/api/categories", json={"categories": ["a", "b", "c"]}
    )
    assert response.status_code == 200


async def test_post_sources_rejects_over_cap(
    client: AsyncClient,
    db_session: AsyncSession,
    demo_mode_with_default_user,
    monkeypatch,
):
    monkeypatch.setattr(settings, "demo_max_per_entity", 2)
    for i in range(2):
        db_session.add(Source(id=f"src{i}", name=f"src-{i}"))
    await db_session.flush()
    response = await client.post(
        "/api/sources",
        json={"source": {"id": "src-extra", "name": "src-extra", "mappings": []}},
    )
    assert response.status_code == 403
    assert "sources" in response.json()["detail"]


async def test_post_dashboards_rejects_over_cap(
    client: AsyncClient,
    db_session: AsyncSession,
    demo_mode_with_default_user,
    monkeypatch,
):
    from datetime import date as _date

    monkeypatch.setattr(settings, "demo_max_per_entity", 2)
    for i in range(2):
        db_session.add(
            Dashboard(
                id=f"d{i}",
                name=f"D{i}",
                date_range_start=_date(2026, 1, 1),
                date_range_end=_date(2026, 12, 31),
            )
        )
    await db_session.flush()
    response = await client.post(
        "/api/dashboards",
        json={
            "id": "d-extra",
            "name": "D-extra",
            "isDefault": False,
            "dateRangeStart": "2026-01-01",
            "dateRangeEnd": "2026-12-31",
        },
    )
    assert response.status_code == 403
    assert "dashboards" in response.json()["detail"]


async def test_post_dashboard_panels_rejects_over_cap(
    client: AsyncClient,
    db_session: AsyncSession,
    demo_mode_with_default_user,
    monkeypatch,
):
    from datetime import date as _date

    monkeypatch.setattr(settings, "demo_max_per_entity", 2)
    db_session.add(
        Dashboard(
            id="dp",
            name="DP",
            date_range_start=_date(2026, 1, 1),
            date_range_end=_date(2026, 12, 31),
        )
    )
    await db_session.flush()
    for i in range(2):
        db_session.add(
            DashboardPanel(
                id=f"pp{i}",
                dashboard_id="dp",
                title=f"P{i}",
                chart_type="bar",
                panel_order=i,
            )
        )
    await db_session.flush()
    response = await client.post(
        "/api/dashboards/dp/panels",
        json={
            "id": "pp-extra",
            "title": "P-extra",
            "chartType": "bar",
            "filterGroups": [],
            "panelOrder": 5,
        },
    )
    assert response.status_code == 403
    assert "dashboard_panels" in response.json()["detail"]


async def test_post_reports_rejects_over_cap(
    client: AsyncClient,
    db_session: AsyncSession,
    demo_mode_with_default_user,
    monkeypatch,
):
    monkeypatch.setattr(settings, "demo_max_per_entity", 2)
    for i in range(2):
        db_session.add(Report(id=f"r{i}", name=f"R{i}", filters={}))
    await db_session.flush()
    response = await client.post(
        "/api/reports",
        json={
            "report": {
                "id": "r-extra",
                "name": "R-extra",
                "description": None,
                "filters": {},
                "createdAt": None,
                "lastModified": None,
            }
        },
    )
    assert response.status_code == 403
    assert "reports" in response.json()["detail"]


async def test_post_accounts_rejects_over_cap(
    client: AsyncClient,
    db_session: AsyncSession,
    demo_mode_with_default_user,
    monkeypatch,
):
    monkeypatch.setattr(settings, "demo_max_per_entity", 2)
    for i in range(2):
        db_session.add(Account(id=f"acct{i}", name=f"A{i}", type="asset"))
    await db_session.flush()
    response = await client.post(
        "/api/accounts",
        json={"id": "acct-extra", "name": "A-extra", "type": "asset"},
    )
    assert response.status_code == 403
    assert "accounts" in response.json()["detail"]


async def test_post_account_balances_rejects_over_cap(
    client: AsyncClient,
    db_session: AsyncSession,
    demo_mode_with_default_user,
    monkeypatch,
):
    from datetime import date as _date

    monkeypatch.setattr(settings, "demo_max_per_entity", 2)
    db_session.add(Account(id="abacct", name="A", type="asset"))
    await db_session.flush()
    for i in range(2):
        db_session.add(
            AccountBalance(
                id=f"bb{i}",
                account_id="abacct",
                balance=0,
                date=_date(2026, 1, 1),
            )
        )
    await db_session.flush()
    response = await client.post(
        "/api/accounts/abacct/balances",
        json={
            "id": "bb-extra",
            "balance": 100,
            "date": "2026-02-01",
        },
    )
    assert response.status_code == 403
    assert "account_balances" in response.json()["detail"]


async def test_post_date_range_rejects_over_cap(
    client: AsyncClient,
    db_session: AsyncSession,
    demo_mode_with_default_user,
    monkeypatch,
):
    from datetime import date as _date

    monkeypatch.setattr(settings, "demo_max_per_entity", 2)
    for i in range(2):
        db_session.add(
            DateRange(
                start_date=_date(2026, 1, i + 1),
                end_date=_date(2026, 12, 31),
            )
        )
    await db_session.flush()
    response = await client.post(
        "/api/date-range",
        json={"start": "2026-03-01", "end": "2026-12-31"},
    )
    assert response.status_code == 403
    assert "date_ranges" in response.json()["detail"]


async def test_restore_disabled_in_demo_mode(
    client: AsyncClient, demo_mode_with_default_user
):
    """Demo mode: /restore is fully disabled with 503."""
    backup_json = (
        b'{"users": [], "categories": [], "sources": [], "reports": [], '
        b'"date_ranges": [], "metadata": [], "accounts": [], '
        b'"account_balances": [], "transactions": []}'
    )
    files = {"backupFile": ("backup.json", backup_json, "application/json")}
    response = await client.post("/api/restore", files=files)
    assert response.status_code == 503
    assert "demo" in response.json()["detail"].lower()


async def test_restore_works_outside_demo_mode(client: AsyncClient):
    """Regression: /restore still works when demo mode is off."""
    backup_json = (
        b'{"users": [], "categories": [], "sources": [], "reports": [], '
        b'"date_ranges": [], "metadata": [], "accounts": [], '
        b'"account_balances": [], "transactions": []}'
    )
    files = {"backupFile": ("backup.json", backup_json, "application/json")}
    response = await client.post("/api/restore", files=files)
    assert response.status_code != 503
