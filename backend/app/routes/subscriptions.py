from __future__ import annotations

from datetime import datetime
from typing import cast

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_household_id
from app.models.household import Household
from app.models.subscription import Subscription
from app.models.transaction import Transaction
from app.schemas.subscription import (
    CadenceLiteral,
    StatusLiteral,
    SubscriptionDetailOut,
    SubscriptionListResponse,
    SubscriptionMemberOut,
    SubscriptionOut,
    TypeLiteral,
)

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
        expected_amount=sub.expected_amount,
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
                amount=t.amount,
                type=cast(TypeLiteral, t.type),
                category=t.category,
                user=t.created_by_user_id,
            )
            for t in members_rows
        ],
    )
