"""Subscription detection orchestrator and background-task runner."""

from __future__ import annotations

import asyncio
from collections.abc import Sequence
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory
from app.models.household import Household
from app.models.subscription import Subscription
from app.models.transaction import Transaction
from app.utils.subscription_detection import DetectionResult, detect_subscriptions
from app.utils.subscription_signature import normalize_signature

_household_locks: dict[str, asyncio.Lock] = {}


def _lock_for(household_id: str) -> asyncio.Lock:
    lock = _household_locks.get(household_id)
    if lock is None:
        lock = asyncio.Lock()
        _household_locks[household_id] = lock
    return lock


def _txns_to_dicts(txns: Sequence[Transaction]) -> list[dict]:
    return [
        {
            "id": t.id,
            "date": t.date,
            "description": t.description,
            "category": t.category,
            "amount": float(t.amount),
            "type": t.type,
            "user": t.created_by_user_id,
            "labels": t.labels or [],
            "metadata": t.metadata_ or {},
            "transferInfo": t.transfer_info,
            "excludedFromCalculations": t.excluded_from_calculations,
            "subscriptionId": t.subscription_id,
        }
        for t in txns
    ]


def _subs_to_dicts(subs: Sequence[Subscription]) -> list[dict]:
    return [
        {
            "id": s.id,
            "name": s.name,
            "cadence": s.cadence,
            "expected_amount": float(s.expected_amount),
            "type": s.type,
            "status": s.status,
            "first_seen": s.first_seen,
            "last_seen": s.last_seen,
            "detection_signature": s.detection_signature,
            "user_overrides": s.user_overrides or {},
            "metadata": s.metadata_ or {},
        }
        for s in subs
    ]


async def run_detection(
    db: AsyncSession,
    household_id: str,
    *,
    strip_existing: bool = False,
) -> dict:
    """Run full detection for the household and persist results."""
    txns_result = await db.execute(
        select(Transaction).where(Transaction.household_id == household_id)
    )
    txns = list(txns_result.scalars().all())

    subs_result = await db.execute(
        select(Subscription).where(Subscription.household_id == household_id)
    )
    existing = list(subs_result.scalars().all())

    if strip_existing:
        # Remove auto-detected memberships (not manual/cancelled subs or overrides).
        for t in txns:
            sub_for_t = next((s for s in existing if s.id == t.subscription_id), None)
            if sub_for_t is None or sub_for_t.status in {"manual", "cancelled"}:
                continue
            t.subscription_id = None
        await db.flush()

    txn_dicts = _txns_to_dicts(txns)
    existing_dicts = _subs_to_dicts(existing)

    result = detect_subscriptions(txn_dicts, existing_dicts)

    await _persist_result(
        db, household_id=household_id, existing=existing, result=result
    )
    h = (
        await db.execute(select(Household).where(Household.id == household_id))
    ).scalar_one()
    h.last_subscription_detection_at = datetime.now(UTC).replace(tzinfo=None)
    await db.commit()

    return {
        "success": True,
        "subscriptionsTotal": len(result["subscriptions"]),
    }


async def reconcile_signature(
    db: AsyncSession,
    household_id: str,
    signature: str,
) -> None:
    """Re-run detection scoped to a single signature's transactions."""
    if not signature:
        return

    txns_result = await db.execute(
        select(Transaction).where(Transaction.household_id == household_id)
    )
    all_txns = list(txns_result.scalars().all())
    relevant = [t for t in all_txns if normalize_signature(t.description) == signature]

    subs_result = await db.execute(
        select(Subscription).where(
            Subscription.household_id == household_id,
            Subscription.detection_signature == signature,
        )
    )
    existing = list(subs_result.scalars().all())

    if not relevant and not existing:
        return

    result = detect_subscriptions(_txns_to_dicts(relevant), _subs_to_dicts(existing))
    await _persist_result(
        db, household_id=household_id, existing=existing, result=result
    )
    await db.commit()


async def _persist_result(
    db: AsyncSession,
    *,
    household_id: str,
    existing: list[Subscription],
    result: DetectionResult,
) -> None:
    existing_by_id = {s.id: s for s in existing}

    for sub_dict in result["subscriptions"]:
        sub_id = sub_dict["id"]
        row = existing_by_id.get(sub_id)
        if row is None:
            row = Subscription(
                id=sub_id,
                household_id=household_id,
                name=sub_dict["name"],
                cadence=sub_dict["cadence"],
                expected_amount=Decimal(str(sub_dict["expected_amount"])),
                type=sub_dict["type"],
                status=sub_dict["status"],
                first_seen=sub_dict["first_seen"],
                last_seen=sub_dict["last_seen"],
                detection_signature=sub_dict.get("detection_signature"),
                user_overrides=sub_dict["user_overrides"],
                metadata_=sub_dict.get("metadata") or {},
            )
            db.add(row)
        else:
            row.name = sub_dict["name"]
            row.cadence = sub_dict["cadence"]
            row.expected_amount = Decimal(str(sub_dict["expected_amount"]))
            row.status = sub_dict["status"]
            row.first_seen = sub_dict["first_seen"]
            row.last_seen = sub_dict["last_seen"]
            row.user_overrides = sub_dict["user_overrides"]

    if result["transaction_assignments"]:
        txn_ids = list(result["transaction_assignments"].keys())
        rows = (
            (await db.execute(select(Transaction).where(Transaction.id.in_(txn_ids))))
            .scalars()
            .all()
        )
        for t in rows:
            new_sub = result["transaction_assignments"].get(t.id)
            t.subscription_id = new_sub

    await db.flush()


async def run_detection_bg(household_id: str) -> None:
    """Background-task wrapper: opens its own session, holds household lock."""
    async with _lock_for(household_id), async_session_factory() as db:
        await run_detection(db, household_id=household_id)


async def reconcile_signature_bg(household_id: str, signature: str) -> None:
    async with _lock_for(household_id), async_session_factory() as db:
        await reconcile_signature(db, household_id=household_id, signature=signature)


async def rerun_detection_bg(household_id: str) -> None:
    async with _lock_for(household_id), async_session_factory() as db:
        await run_detection(db, household_id=household_id, strip_existing=True)
