import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.account import Account, AccountBalance
from app.models.dashboard import Dashboard, DashboardPanel
from app.models.transaction import Transaction
from app.models.user import User


@pytest.mark.asyncio
async def test_reset_refuses_when_demo_mode_off():
    from app.demo import reset as reset_mod

    original = settings.finance_manager_demo_mode
    settings.finance_manager_demo_mode = False
    try:
        with pytest.raises(SystemExit) as excinfo:
            await reset_mod.reset_demo()
        assert excinfo.value.code != 0
    finally:
        settings.finance_manager_demo_mode = original


@pytest.mark.asyncio
async def test_reset_wipes_and_inserts_fixture(db_session: AsyncSession):
    """Reset should wipe pre-existing data and insert the fixture."""
    # Seed a stray row that should be wiped
    db_session.add(User(id="stray-user", name="Stray"))
    await db_session.flush()

    from app.demo import reset as reset_mod

    original = settings.finance_manager_demo_mode
    settings.finance_manager_demo_mode = True
    try:
        await reset_mod._run_reset(db_session)
    finally:
        settings.finance_manager_demo_mode = original

    # Stray user should be gone
    stray = await db_session.execute(select(User).where(User.id == "stray-user"))
    assert stray.scalar_one_or_none() is None

    # Fixture users should exist
    alice = await db_session.execute(select(User).where(User.id == "user-alice"))
    assert alice.scalar_one() is not None

    # At least 500 transactions
    txns = (await db_session.execute(select(Transaction))).scalars().all()
    assert len(txns) >= 500

    # All 5 accounts exist
    accts = (await db_session.execute(select(Account))).scalars().all()
    assert len(accts) == 5

    # All 2 dashboards exist with 6 panels
    dashes = (await db_session.execute(select(Dashboard))).scalars().all()
    assert len(dashes) == 2
    panels = (await db_session.execute(select(DashboardPanel))).scalars().all()
    assert len(panels) == 6

    # Account balances exist
    balances = (await db_session.execute(select(AccountBalance))).scalars().all()
    assert len(balances) > 0


def test_shift_fixture_moves_latest_to_target_date():
    """_shift_fixture with an explicit target shifts all dates by the right delta."""
    from datetime import date

    from app.demo.reset import _shift_fixture

    fixture = {
        "transactions": [
            {"date": "2026-01-01"},
            {"date": "2026-05-17"},  # max
        ],
        "account_balances": [{"date": "2026-03-01"}],
        "dashboards": [
            {"date_range_start": "2026-01-01", "date_range_end": "2026-05-17"},
        ],
        "date_ranges": [
            {"start_date": "2026-04-17", "end_date": "2026-05-17"},
        ],
        "reports": [
            {"filters": {"dateRange": {"start": "2026-01-01", "end": "2026-05-17"}}}
        ],
    }
    target = date(2026, 8, 1)  # 76 days after the fixture's max
    shift = _shift_fixture(fixture, today=target)
    assert shift == 76

    assert fixture["transactions"][0]["date"] == "2026-03-18"
    assert fixture["transactions"][1]["date"] == "2026-08-01"
    assert fixture["account_balances"][0]["date"] == "2026-05-16"
    assert fixture["dashboards"][0]["date_range_end"] == "2026-08-01"
    assert fixture["date_ranges"][0]["end_date"] == "2026-08-01"
    assert fixture["reports"][0]["filters"]["dateRange"]["end"] == "2026-08-01"


def test_shift_fixture_no_op_when_already_today():
    from datetime import date

    from app.demo.reset import _shift_fixture

    fixture = {
        "transactions": [{"date": "2026-05-17"}],
        "account_balances": [],
        "dashboards": [],
        "date_ranges": [],
        "reports": [],
    }
    assert _shift_fixture(fixture, today=date(2026, 5, 17)) == 0
    assert fixture["transactions"][0]["date"] == "2026-05-17"


@pytest.mark.asyncio
async def test_reset_shifts_latest_to_today(db_session: AsyncSession):
    """The latest transaction date should equal today after a reset."""
    from datetime import date as _date

    from app.demo import reset as reset_mod

    original = settings.finance_manager_demo_mode
    settings.finance_manager_demo_mode = True
    try:
        await reset_mod._run_reset(db_session)
    finally:
        settings.finance_manager_demo_mode = original

    txns = (await db_session.execute(select(Transaction))).scalars().all()
    assert len(txns) > 0
    latest = max(t.date for t in txns)
    assert latest == _date.today()

    # Account balances should also have a snapshot on today
    balances = (await db_session.execute(select(AccountBalance))).scalars().all()
    latest_bal = max(b.date for b in balances)
    assert latest_bal == _date.today()

    # Dashboards' date_range_end should be today
    dashes = (await db_session.execute(select(Dashboard))).scalars().all()
    for d in dashes:
        assert d.date_range_end == _date.today()
