"""
Wipes the database and reseeds it from app/demo/fixture.json,
shifting all dates so the latest transaction lands on today.

Invoked by the Coolify scheduled job:
    python -m app.demo.reset

Refuses to run unless FINANCE_MANAGER_DEMO_MODE=true.
"""

from __future__ import annotations

import asyncio
import json
import logging
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session_factory
from app.models.account import Account, AccountBalance
from app.models.category import Category
from app.models.dashboard import Dashboard, DashboardPanel
from app.models.date_range import DateRange
from app.models.household import Household
from app.models.import_session import ImportSession
from app.models.invitation import Invitation
from app.models.metadata import Metadata
from app.models.report import Report
from app.models.source import Source
from app.models.transaction import Transaction
from app.models.user import User

logger = logging.getLogger("demo.reset")
logging.basicConfig(level=logging.INFO, format="%(message)s")

FIXTURE_PATH = Path(__file__).parent / "fixture.json"


# Wipe order: FK-safe (children first). Household is wiped LAST because all
# data tables reference it.
_WIPE_ORDER = [
    DashboardPanel,
    Dashboard,
    AccountBalance,
    Account,
    Transaction,
    ImportSession,
    Report,
    DateRange,
    Metadata,
    Source,
    Category,
    Invitation,
    User,
    Household,
]


async def _wipe_all(db: AsyncSession) -> None:
    for model in _WIPE_ORDER:
        await db.execute(delete(model))


async def _insert_fixture(db: AsyncSession, fixture: dict[str, Any]) -> None:
    # Households — must come first so child rows can reference them.
    # If the fixture doesn't list households (older fixtures), seed the default.
    households = fixture.get("households") or [
        {"id": "household-demo", "name": "Demo Household"}
    ]
    for h in households:
        db.add(Household(id=h["id"], name=h["name"]))
    await db.flush()

    # Older fixtures (pre-household) don't carry household_id on rows; default
    # them to the first household in the fixture so the legacy demo continues
    # to work.
    default_hid = households[0]["id"]

    def _hid(item: dict[str, Any]) -> str:
        return item.get("household_id") or default_hid

    # Users
    for u in fixture["users"]:
        db.add(
            User(
                id=u["id"],
                name=u["name"],
                email=u["email"],
                password_hash=u["password_hash"],
                household_id=_hid(u),
            )
        )

    # Categories
    for c in fixture["categories"]:
        cat_id = c.get("id") or c["name"]
        db.add(Category(id=cat_id, name=c["name"], household_id=_hid(c)))

    # Sources
    for s in fixture["sources"]:
        db.add(
            Source(
                id=s["id"],
                name=s["name"],
                household_id=_hid(s),
                mappings=s.get("mappings", []),
                flip_income_expense=s.get("flip_income_expense", False),
            )
        )

    # Metadata (global key-value store; not household-scoped)
    for m in fixture.get("metadata", []):
        db.add(Metadata(key=m["key"], value=m.get("value")))

    # Date ranges (id is autoincrement int — don't set it)
    for dr in fixture["date_ranges"]:
        db.add(
            DateRange(
                household_id=_hid(dr),
                start_date=date.fromisoformat(dr["start_date"]),
                end_date=date.fromisoformat(dr["end_date"]),
            )
        )

    # Reports
    for r in fixture["reports"]:
        db.add(
            Report(
                id=r["id"],
                name=r["name"],
                household_id=_hid(r),
                description=r.get("description"),
                filters=r.get("filters"),
            )
        )

    # Transactions
    for t in fixture["transactions"]:
        # Fixtures may still use `user_id`; accept either field name.
        created_by = t.get("created_by_user_id") or t.get("user_id")
        db.add(
            Transaction(
                id=t["id"],
                date=date.fromisoformat(t["date"]),
                description=t["description"],
                category=t["category"],
                amount=t["amount"],
                type=t["type"],
                household_id=_hid(t),
                created_by_user_id=created_by,
                labels=t.get("labels", []),
                metadata_=t.get("metadata", {}),
                transfer_info=t.get("transfer_info"),
                excluded_from_calculations=t.get("excluded_from_calculations", False),
            )
        )

    # Accounts
    for a in fixture["accounts"]:
        created_by = a.get("created_by_user_id") or a.get("user_id")
        db.add(
            Account(
                id=a["id"],
                household_id=_hid(a),
                created_by_user_id=created_by,
                name=a["name"],
                type=a["type"],
                teller_account_id=a.get("teller_account_id"),
                teller_enrollment_id=a.get("teller_enrollment_id"),
            )
        )

    # Account balances
    for b in fixture["account_balances"]:
        db.add(
            AccountBalance(
                id=b["id"],
                account_id=b["account_id"],
                balance=b["balance"],
                date=date.fromisoformat(b["date"]),
                note=b.get("note"),
            )
        )

    # Dashboards + panels
    for d in fixture["dashboards"]:
        db.add(
            Dashboard(
                id=d["id"],
                name=d["name"],
                household_id=_hid(d),
                is_default=d.get("is_default", False),
                date_range_start=date.fromisoformat(d["date_range_start"]),
                date_range_end=date.fromisoformat(d["date_range_end"]),
            )
        )
    for p in fixture["dashboard_panels"]:
        db.add(
            DashboardPanel(
                id=p["id"],
                dashboard_id=p["dashboard_id"],
                title=p["title"],
                chart_type=p["chart_type"],
                filter_type=p.get("filter_type"),
                filter_categories=p.get("filter_categories", []),
                filter_regex=p.get("filter_regex"),
                filter_groups=p.get("filter_groups", []),
                series_mode=p.get("series_mode"),
                net_orientation=p.get("net_orientation"),
                legend_options=p.get("legend_options"),
                panel_order=p.get("panel_order", 0),
            )
        )


def _load_fixture() -> dict[str, Any]:
    return json.loads(FIXTURE_PATH.read_text())


def _shift_fixture(fixture: dict[str, Any], today: date | None = None) -> int:
    """Mutates `fixture` in place: shifts all dates so max(transaction.date) == today.
    Returns the shift in days."""
    target = today if today is not None else date.today()
    max_iso = max(t["date"] for t in fixture["transactions"])
    max_date = date.fromisoformat(max_iso)
    shift_days = (target - max_date).days
    if shift_days == 0:
        return 0
    delta = timedelta(days=shift_days)

    def shift_iso(s: str) -> str:
        return (date.fromisoformat(s) + delta).isoformat()

    for t in fixture["transactions"]:
        t["date"] = shift_iso(t["date"])
    for b in fixture["account_balances"]:
        b["date"] = shift_iso(b["date"])
    for d in fixture["dashboards"]:
        d["date_range_start"] = shift_iso(d["date_range_start"])
        d["date_range_end"] = shift_iso(d["date_range_end"])
    for dr in fixture["date_ranges"]:
        dr["start_date"] = shift_iso(dr["start_date"])
        dr["end_date"] = shift_iso(dr["end_date"])
    for r in fixture["reports"]:
        f = r.get("filters") or {}
        if isinstance(f.get("dateRange"), dict):
            if "start" in f["dateRange"]:
                f["dateRange"]["start"] = shift_iso(f["dateRange"]["start"])
            if "end" in f["dateRange"]:
                f["dateRange"]["end"] = shift_iso(f["dateRange"]["end"])
    return shift_days


async def _run_reset(db: AsyncSession) -> None:
    """The transactional core, separated so tests can pass a fixture session."""
    fixture = _load_fixture()
    shift = _shift_fixture(fixture)
    await _wipe_all(db)
    await _insert_fixture(db, fixture)
    await db.flush()
    logger.info(
        "demo reset: shifted %d days; inserted %d users, %d sources, "
        "%d transactions, %d accounts",
        shift,
        len(fixture["users"]),
        len(fixture["sources"]),
        len(fixture["transactions"]),
        len(fixture["accounts"]),
    )


async def reset_demo() -> None:
    if not settings.finance_manager_demo_mode:
        logger.error("refusing to run: demo mode is not enabled")
        sys.exit(2)

    async with async_session_factory() as db, db.begin():
        await _run_reset(db)


if __name__ == "__main__":
    asyncio.run(reset_demo())
