import secrets
import statistics
import time
from collections import defaultdict
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_household_id
from app.models.budget import Budget
from app.routes.categories import household_category_names
from app.schemas.budget import BudgetSaveRequest
from app.utils.budgets import (
    format_month,
    month_end,
    month_window,
    monthly_actuals,
    months_with_data,
    parse_month,
    resolve_limit,
)

router = APIRouter(prefix="/api", tags=["budgets"])


def _new_id() -> str:
    return f"bud_{int(time.time() * 1000):x}_{secrets.token_hex(4)}"


def _month_or_422(value: str) -> date:
    try:
        return parse_month(value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


async def _versions_by_category(
    db: AsyncSession, household_id: str
) -> dict[str, list[Budget]]:
    rows = (
        (await db.execute(select(Budget).where(Budget.household_id == household_id)))
        .scalars()
        .all()
    )
    grouped: dict[str, list[Budget]] = defaultdict(list)
    for row in rows:
        grouped[row.category].append(row)
    return grouped


@router.get("/budgets")
async def get_budgets(
    month: str = Query(...),
    history: int = Query(6, ge=1, le=12),
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    selected = _month_or_422(month)
    window = month_window(selected, history)
    versions = await _versions_by_category(db, household_id)
    actuals = await monthly_actuals(db, household_id, window[0], month_end(selected))
    with_data = await months_with_data(db, household_id, window[0], month_end(selected))
    known = set(await household_category_names(db, household_id))

    categories = []
    for category in sorted(versions):
        limit = resolve_limit(versions[category], selected)
        if limit is None:
            continue
        history_rows = []
        for m in window:
            m_limit = resolve_limit(versions[category], m)
            history_rows.append(
                {
                    "month": format_month(m),
                    "limit": int(m_limit) if m_limit is not None else None,
                    "actual": actuals.get((category, m), 0.0),
                    "hasData": m in with_data,
                }
            )
        categories.append(
            {
                "category": category,
                "limit": int(limit),
                "actual": actuals.get((category, selected), 0.0),
                "inCategoryList": category in known,
                "history": history_rows,
            }
        )

    all_versions = [v for vs in versions.values() for v in vs]
    earliest = min((v.effective_month for v in all_versions), default=None)
    return {
        "month": format_month(selected),
        "earliestMonth": format_month(earliest) if earliest else None,
        "hasData": selected in with_data,
        "categories": categories,
    }


@router.get("/budgets/typical")
async def get_typical(
    category: str = Query(...),
    month: str = Query(...),
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    """Suggested starting limit: the median of the six months ending at
    `month`, counting months without spending as 0 (like the Everyday card)."""
    selected = _month_or_422(month)
    window = month_window(selected, 6)
    actuals = await monthly_actuals(db, household_id, window[0], month_end(selected))
    amounts = [actuals.get((category, m), 0.0) for m in window]
    if not any(amounts):
        return {"typical": None}
    return {"typical": round(statistics.median(amounts))}


@router.put("/budgets")
async def save_budget(
    body: BudgetSaveRequest,
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    month = _month_or_422(body.month)
    has_versions = (
        await db.execute(
            select(Budget.id)
            .where(
                Budget.household_id == household_id,
                Budget.category == body.category,
            )
            .limit(1)
        )
    ).first() is not None
    if not has_versions:
        if body.amount is None:
            raise HTTPException(status_code=400, detail="No limit to remove")
        if body.category not in await household_category_names(db, household_id):
            raise HTTPException(status_code=400, detail="Unknown category")

    stmt = insert(Budget).values(
        id=_new_id(),
        household_id=household_id,
        category=body.category,
        effective_month=month,
        amount=body.amount,
    )
    await db.execute(
        stmt.on_conflict_do_update(
            constraint="budgets_household_category_month_uniq",
            set_={
                "amount": stmt.excluded.amount,
                "updated_at": func.current_timestamp(),
            },
        )
    )
    await db.commit()
    return {"category": body.category, "month": body.month, "amount": body.amount}
