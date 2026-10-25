"""Subscription detection orchestrator and background-task runner."""

from __future__ import annotations

import asyncio
import logging
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

_log = logging.getLogger(__name__)

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
            "transferGroupId": t.transfer_group_id,
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
            row.detection_signature = sub_dict.get("detection_signature")
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

    for sub_id in result["deleted_subscription_ids"]:
        row = existing_by_id.get(sub_id)
        if row is not None:
            await db.delete(row)
    await db.flush()


class SubscriptionNotFoundError(LookupError):
    pass


async def merge_subscriptions(
    db: AsyncSession,
    household_id: str,
    target_id: str,
    source_ids: list[str],
    name: str | None = None,
) -> Subscription:
    """Fold the source subs into the target: members, overrides, and merged
    descriptor signatures move over, then the sources are deleted. Does not
    commit."""
    if not source_ids or target_id in source_ids:
        raise ValueError("Pick at least one other subscription to merge")
    ids = [target_id, *dict.fromkeys(source_ids)]
    subs = {
        s.id: s
        for s in (
            await db.execute(
                select(Subscription).where(
                    Subscription.id.in_(ids),
                    Subscription.household_id == household_id,
                )
            )
        )
        .scalars()
        .all()
    }
    if len(subs) != len(ids):
        raise SubscriptionNotFoundError("Subscription not found")
    target = subs[target_id]
    sources = [subs[sid] for sid in ids[1:]]

    signatures: set[str] = set()
    # Ordered sets: dict keys keep first-seen order.
    included: dict[str, None] = {}
    excluded: dict[str, None] = {}
    for s in [target, *sources]:
        if s.detection_signature:
            signatures.add(s.detection_signature)
        signatures.update((s.metadata_ or {}).get("mergedSignatures") or [])
        overrides = s.user_overrides or {}
        included.update(dict.fromkeys(overrides.get("includedTxnIds") or []))
        excluded.update(dict.fromkeys(overrides.get("excludedTxnIds") or []))

    members = list(
        (
            await db.execute(
                select(Transaction).where(
                    Transaction.subscription_id.in_(ids),
                    Transaction.household_id == household_id,
                )
            )
        )
        .scalars()
        .all()
    )
    for t in members:
        t.subscription_id = target.id

    overrides = dict(target.user_overrides or {})
    overrides["includedTxnIds"] = list(included)
    overrides["excludedTxnIds"] = [t for t in excluded if t not in included]
    if name is not None and name.strip():
        target.name = name.strip()
        overrides["lockName"] = True
    target.user_overrides = overrides
    target.metadata_ = {
        **(target.metadata_ or {}),
        "mergedSignatures": sorted(signatures),
    }

    if members:
        members.sort(key=lambda t: t.date)
        target.first_seen = members[0].date
        target.last_seen = members[-1].date
        if not overrides.get("lockAmount"):
            # Latest charge reflects the current price across descriptors.
            target.expected_amount = abs(members[-1].amount)

    await db.flush()
    for s in sources:
        await db.delete(s)
    await db.flush()
    return target


async def run_detection_bg(household_id: str) -> None:
    """Background-task wrapper: opens its own session, holds household lock.

    Errors are logged and swallowed — detection is best-effort and must never
    surface to a user request that has already returned.
    """
    try:
        async with _lock_for(household_id), async_session_factory() as db:
            await run_detection(db, household_id=household_id)
    except Exception:
        _log.exception("Subscription detection failed for household %s", household_id)


async def rerun_detection_bg(household_id: str) -> None:
    try:
        async with _lock_for(household_id), async_session_factory() as db:
            await run_detection(db, household_id=household_id, strip_existing=True)
    except Exception:
        _log.exception("Subscription rerun failed for household %s", household_id)
