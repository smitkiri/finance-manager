from __future__ import annotations

import secrets
import time
from collections import Counter
from datetime import datetime
from decimal import Decimal
from typing import cast

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_household_id
from app.models.household import Household
from app.models.subscription import Subscription
from app.models.transaction import Transaction
from app.schemas.subscription import (
    CadenceLiteral,
    DetectionQueuedResponse,
    StatusLiteral,
    SubscriptionCreate,
    SubscriptionDetailOut,
    SubscriptionListResponse,
    SubscriptionMemberOut,
    SubscriptionMembersBody,
    SubscriptionOut,
    SubscriptionPatch,
    TypeLiteral,
)
from app.utils.subscription_signature import normalize_signature
from app.utils.subscription_utils import rerun_detection_bg, run_detection_bg

router = APIRouter(prefix="/api/subscriptions", tags=["subscriptions"])


MONTHLY_MULT: dict[str, float] = {
    "weekly": 4.33,
    "biweekly": 2.17,
    "monthly": 1.0,
    "quarterly": 1.0 / 3.0,
    "annual": 1.0 / 12.0,
}


async def _household_last_detected_at(
    db: AsyncSession, household_id: str
) -> datetime | None:
    row = (
        await db.execute(
            select(Household.last_subscription_detection_at).where(
                Household.id == household_id
            )
        )
    ).first()
    return row[0] if row else None


async def _member_count(db: AsyncSession, sub_id: str) -> int:
    return (
        await db.execute(
            select(func.count(Transaction.id)).where(
                Transaction.subscription_id == sub_id
            )
        )
    ).scalar_one()


def _to_out(sub: Subscription, members_count: int) -> SubscriptionOut:
    monthly = float(sub.expected_amount) * MONTHLY_MULT.get(sub.cadence, 1.0)
    return SubscriptionOut(
        id=sub.id,
        name=sub.name,
        cadence=cast(CadenceLiteral, sub.cadence),
        expected_amount=float(sub.expected_amount),
        type=cast(TypeLiteral, sub.type),
        status=cast(StatusLiteral, sub.status),
        first_seen=sub.first_seen,
        last_seen=sub.last_seen,
        detection_signature=sub.detection_signature,
        user_overrides=sub.user_overrides or {},
        member_count=members_count,
        monthly_normalized_amount=monthly,
    )


@router.get("", response_model=SubscriptionListResponse)
async def list_subscriptions(
    status: str | None = Query(default=None),
    type: str | None = Query(default=None),
    userId: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
) -> SubscriptionListResponse:
    stmt = select(Subscription).where(Subscription.household_id == household_id)
    if status:
        wanted = [s.strip() for s in status.split(",") if s.strip()]
        if wanted:
            stmt = stmt.where(Subscription.status.in_(wanted))
    if type:
        stmt = stmt.where(Subscription.type == type)

    subs = list((await db.execute(stmt.offset(offset).limit(limit))).scalars().all())

    if userId:
        sub_ids = [s.id for s in subs]
        if sub_ids:
            visible_ids = set(
                (
                    await db.execute(
                        select(Transaction.subscription_id)
                        .where(
                            Transaction.subscription_id.in_(sub_ids),
                            Transaction.created_by_user_id == userId,
                        )
                        .distinct()
                    )
                )
                .scalars()
                .all()
            )
            subs = [s for s in subs if s.id in visible_ids]

    out = [_to_out(s, await _member_count(db, s.id)) for s in subs]
    last_detected_at = await _household_last_detected_at(db, household_id)
    return SubscriptionListResponse(
        subscriptions=out, last_detected_at=last_detected_at, total=len(out)
    )


@router.get("/{sub_id}", response_model=SubscriptionDetailOut)
async def get_subscription(
    sub_id: str,
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    sub = (
        await db.execute(
            select(Subscription).where(
                Subscription.id == sub_id,
                Subscription.household_id == household_id,
            )
        )
    ).scalar_one_or_none()
    if not sub:
        return JSONResponse(
            status_code=404, content={"error": "Subscription not found"}
        )

    members_rows = list(
        (
            await db.execute(
                select(Transaction)
                .where(Transaction.subscription_id == sub_id)
                .order_by(Transaction.date.desc())
            )
        )
        .scalars()
        .all()
    )
    return SubscriptionDetailOut(
        **_to_out(sub, len(members_rows)).model_dump(),
        members=[
            SubscriptionMemberOut(
                id=t.id,
                date=t.date,
                description=t.description,
                amount=float(t.amount),
                type=cast(TypeLiteral, t.type),
                category=t.category,
                user=t.created_by_user_id,
            )
            for t in members_rows
        ],
    )


def _new_id() -> str:
    return f"sub_{int(time.time() * 1000):x}_{secrets.token_hex(4)}"


async def _derive_signature(
    db: AsyncSession, txn_ids: list[str], household_id: str
) -> str | None:
    if not txn_ids:
        return None
    rows = (
        (
            await db.execute(
                select(Transaction.description).where(
                    Transaction.id.in_(txn_ids),
                    Transaction.household_id == household_id,
                )
            )
        )
        .scalars()
        .all()
    )
    sigs = [normalize_signature(d) for d in rows if d]
    sigs = [s for s in sigs if s]
    if not sigs:
        return None
    return Counter(sigs).most_common(1)[0][0]


@router.post("", response_model=SubscriptionOut)
async def create_subscription(
    body: SubscriptionCreate,
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    has_members = bool(body.transactionIds)
    signature = (
        await _derive_signature(db, body.transactionIds, household_id)
        if has_members
        else None
    )
    status = "active" if has_members else "manual"

    sub = Subscription(
        id=_new_id(),
        household_id=household_id,
        name=body.name,
        cadence=body.cadence,
        expected_amount=Decimal(str(body.expected_amount)),
        type=body.type,
        status=status,
        first_seen=None,
        last_seen=None,
        detection_signature=signature,
        user_overrides={
            "excludedTxnIds": [],
            "includedTxnIds": list(body.transactionIds),
            "lockName": False,
            "lockAmount": False,
            "lockCadence": False,
        },
        metadata_={},
    )
    db.add(sub)
    await db.flush()

    if has_members:
        rows = list(
            (
                await db.execute(
                    select(Transaction).where(
                        Transaction.id.in_(body.transactionIds),
                        Transaction.household_id == household_id,
                    )
                )
            )
            .scalars()
            .all()
        )
        if len(rows) != len(body.transactionIds):
            return JSONResponse(
                status_code=400, content={"error": "Some transactions not found"}
            )
        if any(t.type != body.type for t in rows):
            return JSONResponse(
                status_code=400,
                content={"error": "Member transactions must match subscription type"},
            )
        dates = sorted(t.date for t in rows)
        sub.first_seen = dates[0]
        sub.last_seen = dates[-1]
        for t in rows:
            t.subscription_id = sub.id

    await db.commit()
    member_count = await _member_count(db, sub.id)
    return _to_out(sub, member_count)


@router.patch("/{sub_id}", response_model=SubscriptionOut)
async def patch_subscription(
    sub_id: str,
    body: SubscriptionPatch,
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    sub = (
        await db.execute(
            select(Subscription).where(
                Subscription.id == sub_id,
                Subscription.household_id == household_id,
            )
        )
    ).scalar_one_or_none()
    if not sub:
        return JSONResponse(
            status_code=404, content={"error": "Subscription not found"}
        )

    overrides = dict(sub.user_overrides or {})
    if body.name is not None:
        sub.name = body.name
        overrides["lockName"] = True
    if body.cadence is not None:
        sub.cadence = body.cadence
        overrides["lockCadence"] = True
    if body.expected_amount is not None:
        sub.expected_amount = Decimal(str(body.expected_amount))
        overrides["lockAmount"] = True
    if body.status is not None:
        sub.status = body.status

    sub.user_overrides = overrides
    await db.commit()
    member_count = await _member_count(db, sub.id)
    return _to_out(sub, member_count)


@router.delete("/{sub_id}", status_code=204)
async def delete_subscription(
    sub_id: str,
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    sub = (
        await db.execute(
            select(Subscription).where(
                Subscription.id == sub_id,
                Subscription.household_id == household_id,
            )
        )
    ).scalar_one_or_none()
    if not sub:
        return JSONResponse(
            status_code=404, content={"error": "Subscription not found"}
        )

    await db.execute(
        update(Transaction)
        .where(Transaction.subscription_id == sub_id)
        .values(subscription_id=None)
    )
    await db.delete(sub)
    await db.commit()
    return JSONResponse(status_code=204, content=None)


@router.post("/{sub_id}/members", response_model=SubscriptionOut)
async def add_members(
    sub_id: str,
    body: SubscriptionMembersBody,
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    sub = (
        await db.execute(
            select(Subscription).where(
                Subscription.id == sub_id,
                Subscription.household_id == household_id,
            )
        )
    ).scalar_one_or_none()
    if not sub:
        return JSONResponse(
            status_code=404, content={"error": "Subscription not found"}
        )

    txns = list(
        (
            await db.execute(
                select(Transaction).where(
                    Transaction.id.in_(body.transactionIds),
                    Transaction.household_id == household_id,
                )
            )
        )
        .scalars()
        .all()
    )
    if len(txns) != len(body.transactionIds):
        return JSONResponse(
            status_code=400, content={"error": "Some transactions not found"}
        )
    if any(t.type != sub.type for t in txns):
        return JSONResponse(
            status_code=400,
            content={"error": "Transaction type must match subscription"},
        )

    overrides = dict(sub.user_overrides or {})
    included = list(overrides.get("includedTxnIds") or [])
    excluded = [
        x
        for x in (overrides.get("excludedTxnIds") or [])
        if x not in body.transactionIds
    ]
    for tid in body.transactionIds:
        if tid not in included:
            included.append(tid)
    overrides["includedTxnIds"] = included
    overrides["excludedTxnIds"] = excluded
    sub.user_overrides = overrides

    for t in txns:
        t.subscription_id = sub.id

    await db.commit()
    member_count = await _member_count(db, sub.id)
    return _to_out(sub, member_count)


@router.delete("/{sub_id}/members/{txn_id}", response_model=SubscriptionOut)
async def remove_member(
    sub_id: str,
    txn_id: str,
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    sub = (
        await db.execute(
            select(Subscription).where(
                Subscription.id == sub_id,
                Subscription.household_id == household_id,
            )
        )
    ).scalar_one_or_none()
    if not sub:
        return JSONResponse(
            status_code=404, content={"error": "Subscription not found"}
        )

    overrides = dict(sub.user_overrides or {})
    excluded = list(overrides.get("excludedTxnIds") or [])
    included = [x for x in (overrides.get("includedTxnIds") or []) if x != txn_id]
    if txn_id not in excluded:
        excluded.append(txn_id)
    overrides["excludedTxnIds"] = excluded
    overrides["includedTxnIds"] = included
    sub.user_overrides = overrides

    txn = (
        await db.execute(
            select(Transaction).where(
                Transaction.id == txn_id,
                Transaction.household_id == household_id,
            )
        )
    ).scalar_one_or_none()
    if txn and txn.subscription_id == sub_id:
        txn.subscription_id = None

    await db.commit()
    member_count = await _member_count(db, sub.id)
    return _to_out(sub, member_count)


@router.post("/detect", status_code=202, response_model=DetectionQueuedResponse)
async def trigger_detection(
    bg: BackgroundTasks,
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    bg.add_task(run_detection_bg, household_id)
    last = await _household_last_detected_at(db, household_id)
    return DetectionQueuedResponse(queued=True, last_detected_at=last)


@router.post(
    "/rerun-detection", status_code=202, response_model=DetectionQueuedResponse
)
async def trigger_rerun(
    bg: BackgroundTasks,
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    bg.add_task(rerun_detection_bg, household_id)
    last = await _household_last_detected_at(db, household_id)
    return DetectionQueuedResponse(
        queued=True,
        last_detected_at=last,
        message="Detection queued; manual subscriptions and overrides preserved.",
    )
