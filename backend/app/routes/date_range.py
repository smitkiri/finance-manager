from datetime import date

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.date_range import DateRange
from app.schemas.date_range import DateRangeRequest

router = APIRouter(prefix="/api", tags=["date-range"])


@router.get("/date-range")
async def get_date_range(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DateRange).order_by(DateRange.created_at.desc()).limit(1)
    )
    dr = result.scalar_one_or_none()
    if dr:
        return {"start": str(dr.start_date), "end": str(dr.end_date)}

    # Default: 1 month ago, matching JS: new Date(y, m-1, d)
    today = date.today()
    start = today - relativedelta(months=1)
    return {"start": str(start), "end": str(today)}


@router.post("/date-range")
async def save_date_range(
    body: DateRangeRequest,
    db: AsyncSession = Depends(get_db),
):
    start = date.fromisoformat(body.start)
    end = date.fromisoformat(body.end)
    # UPSERT: matches Express ON CONFLICT (start_date, end_date)
    await db.execute(
        text("""
            INSERT INTO date_ranges (start_date, end_date, created_at)
            VALUES (:start, :end, clock_timestamp())
            ON CONFLICT (start_date, end_date)
            DO UPDATE SET created_at = clock_timestamp()
        """),
        {"start": start, "end": end},
    )
    await db.commit()
    return {"success": True}
