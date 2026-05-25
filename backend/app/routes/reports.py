from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_household_id
from app.models.report import Report
from app.schemas.report import ReportOut, ReportSaveRequest

router = APIRouter(prefix="/api", tags=["reports"])


@router.get("/reports")
async def get_reports(
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Report)
        .where(Report.household_id == household_id)
        .order_by(Report.created_at.desc())
    )
    return [ReportOut.from_orm_model(r).model_dump() for r in result.scalars().all()]


@router.post("/reports")
async def save_report(
    body: ReportSaveRequest,
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    r = body.report
    now = datetime.now(UTC).replace(tzinfo=None)
    created = datetime.fromisoformat(r.createdAt) if r.createdAt else now
    modified = datetime.fromisoformat(r.lastModified) if r.lastModified else now
    stmt = (
        insert(Report)
        .values(
            id=r.id,
            name=r.name,
            description=r.description,
            household_id=household_id,
            filters=r.filters or {},
            created_at=created,
            last_modified=modified,
        )
        .on_conflict_do_update(
            index_elements=[Report.id],
            set_={
                "name": r.name,
                "description": r.description,
                "filters": r.filters or {},
                "last_modified": modified,
            },
        )
    )
    await db.execute(stmt)
    await db.commit()

    return {"success": True, "reportId": r.id}


@router.delete("/reports/{report_id}")
async def delete_report(
    report_id: str,
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        delete(Report).where(
            Report.id == report_id, Report.household_id == household_id
        )
    )
    await db.commit()
    return {"success": True}


@router.post("/reports/{report_id}/data")
async def save_report_data(report_id: str):
    return {"success": True}


@router.get("/reports/{report_id}/data")
async def get_report_data(report_id: str):
    return JSONResponse(status_code=404, content={"error": "Report data not found"})
