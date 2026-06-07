"""Integration test of the orchestrator against a real DB session."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models import Household, Subscription, Transaction
from app.utils.subscription_utils import run_detection

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _pin_today(monkeypatch):
    """Pin `_today()` close to the test transaction dates so detection
    doesn't classify them as stale based on the real wall clock."""
    monkeypatch.setattr(
        "app.utils.subscription_detection._today", lambda: date(2026, 3, 10)
    )


@pytest.fixture
async def household(db_session) -> Household:
    h = Household(id="hh1", name="Test")
    db_session.add(h)
    await db_session.commit()
    return h


def _make_txn(id_: str, *, d: date, amount: float = 15.99) -> Transaction:
    return Transaction(
        id=id_,
        date=d,
        description="Netflix",
        category="Entertainment",
        amount=Decimal(str(amount)),
        type="expense",
        household_id="hh1",
        labels=[],
        metadata_={},
        excluded_from_calculations=False,
    )


async def test_run_detection_creates_subscription(db_session, household) -> None:
    db_session.add_all(
        [
            _make_txn("t1", d=date(2026, 1, 5)),
            _make_txn("t2", d=date(2026, 2, 5)),
            _make_txn("t3", d=date(2026, 3, 5)),
        ]
    )
    await db_session.commit()

    result = await run_detection(db_session, household_id="hh1")
    assert result["subscriptionsTotal"] == 1

    subs = (await db_session.execute(select(Subscription))).scalars().all()
    assert len(subs) == 1
    assert subs[0].cadence == "monthly"

    txns = (await db_session.execute(select(Transaction))).scalars().all()
    assert all(t.subscription_id == subs[0].id for t in txns)


async def test_run_detection_updates_last_detected_at(db_session, household) -> None:
    db_session.add_all(
        [
            _make_txn("t1", d=date(2026, 1, 5)),
            _make_txn("t2", d=date(2026, 2, 5)),
            _make_txn("t3", d=date(2026, 3, 5)),
        ]
    )
    await db_session.commit()

    await run_detection(db_session, household_id="hh1")
    h = (
        await db_session.execute(select(Household).where(Household.id == "hh1"))
    ).scalar_one()
    assert h.last_subscription_detection_at is not None


async def test_run_detection_idempotent(db_session, household) -> None:
    db_session.add_all(
        [
            _make_txn("t1", d=date(2026, 1, 5)),
            _make_txn("t2", d=date(2026, 2, 5)),
            _make_txn("t3", d=date(2026, 3, 5)),
        ]
    )
    await db_session.commit()

    await run_detection(db_session, household_id="hh1")
    sub_id_1 = (await db_session.execute(select(Subscription.id))).scalar_one()

    await run_detection(db_session, household_id="hh1")
    sub_id_2 = (await db_session.execute(select(Subscription.id))).scalar_one()
    assert sub_id_1 == sub_id_2  # same subscription preserved
