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
