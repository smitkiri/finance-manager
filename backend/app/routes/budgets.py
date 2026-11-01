from collections import defaultdict
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_household_id
from app.models.budget import Budget
from app.routes.categories import household_category_names
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
