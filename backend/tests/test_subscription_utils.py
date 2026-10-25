"""Integration test of the orchestrator against a real DB session."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models import Household, Subscription, Transaction
from app.utils.subscription_utils import merge_subscriptions, run_detection

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


def _make_txn(
    id_: str, *, d: date, amount: float = 15.99, description: str = "Netflix"
) -> Transaction:
    return Transaction(
        id=id_,
        date=d,
        description=description,
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


async def test_run_detection_deletes_duplicate_variant_subs(
    db_session, household
) -> None:
    """Older runs left one sub per descriptor variant; a new run folds them
    into one and deletes the empties."""
    for sid, sig in [
        ("sub_a", "club at charles boston ma"),
        ("sub_b", "clubs at charlesboston ma"),
    ]:
        db_session.add(
            Subscription(
                id=sid,
                household_id="hh1",
                name=sig.title(),
                cadence="monthly",
                expected_amount=Decimal("95.00"),
                status="active",
                detection_signature=sig,
                user_overrides={
                    "excludedTxnIds": [],
                    "includedTxnIds": [],
                    "lockName": False,
                    "lockAmount": False,
                    "lockCadence": False,
                },
                metadata_={},
            )
        )
    await db_session.flush()
    rows = [
        ("t1", date(2025, 12, 1), "CLUB AT CHARLES BOSTON MA", "sub_a"),
        ("t2", date(2026, 1, 1), "CLUB AT CHARLES BOSTON MA", "sub_a"),
        ("t3", date(2026, 2, 1), "CLUBS AT CHARLESBOSTON MA", "sub_b"),
        ("t4", date(2026, 3, 1), "CLUBS AT CHARLESBOSTON MA", "sub_b"),
        ("t5", date(2026, 3, 2), "CLUB AT CHARLES BOSTON MA", "sub_a"),
    ]
    for tid, d, desc, sid in rows:
        t = _make_txn(tid, d=d, amount=95.0, description=desc)
        t.subscription_id = sid
        db_session.add(t)
    await db_session.commit()

    await run_detection(db_session, household_id="hh1")

    subs = (await db_session.execute(select(Subscription))).scalars().all()
    assert [s.id for s in subs] == ["sub_a"]
    assert subs[0].detection_signature == "club at charles boston"
    txns = (await db_session.execute(select(Transaction))).scalars().all()
    assert {t.subscription_id for t in txns} == {"sub_a"}


async def test_merge_survives_rerun_detection(db_session) -> None:
    db_session.add(Household(id="hh1", name="Test"))
    await db_session.commit()
    db_session.add_all(
        [
            _make_txn(f"a{i}", d=d, amount=17.0, description="CLAUDE.AI SUBSCRIPTION")
            for i, d in enumerate(
                [date(2025, 10, 2), date(2025, 11, 2), date(2025, 12, 2)]
            )
        ]
        + [
            _make_txn(f"b{i}", d=d, amount=20.0, description="ANTHROPIC CLAUDE SUB")
            for i, d in enumerate(
                [date(2026, 1, 2), date(2026, 2, 2), date(2026, 3, 2)]
            )
        ]
    )
    await db_session.commit()
    await run_detection(db_session, household_id="hh1")
    subs = (await db_session.execute(select(Subscription))).scalars().all()
    assert len(subs) == 2
    target, source = sorted(subs, key=lambda s: s.detection_signature or "")

    await merge_subscriptions(db_session, "hh1", target.id, [source.id], "Claude")
    await db_session.commit()
    await run_detection(db_session, household_id="hh1", strip_existing=True)

    db_session.expire_all()
    subs = (await db_session.execute(select(Subscription))).scalars().all()
    assert [s.id for s in subs] == [target.id]
    assert subs[0].name == "Claude"
    owners = (await db_session.execute(select(Transaction.subscription_id))).scalars()
    assert set(owners) == {target.id}
