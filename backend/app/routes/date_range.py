from datetime import date

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_household_id
from app.models.date_range import DateRange
from app.schemas.date_range import DateRangeRequest

router = APIRouter(prefix="/api", tags=["date-range"])


@router.get("/date-range")
async def get_date_range(
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DateRange)
        .where(DateRange.household_id == household_id)
        .order_by(DateRange.created_at.desc())
        .limit(1)
    )
    dr = result.scalar_one_or_none()
    if dr:
        return {"start": str(dr.start_date), "end": str(dr.end_date)}

    # Default: 1 month ago, matching legacy behavior
    today = date.today()
    start = today - relativedelta(months=1)
    return {"start": str(start), "end": str(today)}


@router.post("/date-range")
async def save_date_range(
    body: DateRangeRequest,
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    start = date.fromisoformat(body.start)
    end = date.fromisoformat(body.end)
    await db.execute(
        text("""
            INSERT INTO date_ranges (household_id, start_date, end_date, created_at)
            VALUES (:hid, :start, :end, clock_timestamp())
            ON CONFLICT (household_id, start_date, end_date)
            DO UPDATE SET created_at = clock_timestamp()
        """),
        {"hid": household_id, "start": start, "end": end},
    )
    await db.commit()
    return {"success": True}
