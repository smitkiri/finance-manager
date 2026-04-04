from datetime import UTC, datetime
from datetime import date as date_type

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.dashboard import Dashboard, DashboardPanel
from app.schemas.dashboard import (
    DashboardCreateRequest,
    DashboardOut,
    DashboardUpdateRequest,
)

router = APIRouter(prefix="/api", tags=["dashboards"])


@router.get("/dashboards")
async def list_dashboards(db: AsyncSession = Depends(get_db)):
    panel_count_subq = (
        select(func.count())
        .where(DashboardPanel.dashboard_id == Dashboard.id)
        .correlate(Dashboard)
        .scalar_subquery()
    )
    stmt = select(Dashboard, panel_count_subq.label("panel_count")).order_by(
        Dashboard.created_at.asc()
    )
    result = await db.execute(stmt)
    rows = result.all()
    return [DashboardOut.from_orm_model(row[0], panel_count=row[1]) for row in rows]


@router.post("/dashboards", status_code=201)
async def create_dashboard(
    body: DashboardCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    if body.isDefault:
        await db.execute(
            update(Dashboard).values(
                is_default=False,
                updated_at=datetime.now(UTC).replace(tzinfo=None),
            )
        )

    dashboard = Dashboard(
        id=body.id,
        name=body.name,
        is_default=body.isDefault,
        date_range_start=date_type.fromisoformat(body.dateRangeStart),
        date_range_end=date_type.fromisoformat(body.dateRangeEnd),
    )
    db.add(dashboard)
    await db.commit()
    await db.refresh(dashboard)
    return DashboardOut.from_orm_model(dashboard)


@router.patch("/dashboards/{dashboard_id}")
async def update_dashboard(
    dashboard_id: str,
    body: DashboardUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        return JSONResponse(
            status_code=400,
            content={"error": "Nothing to update"},
        )

    result = await db.execute(select(Dashboard).where(Dashboard.id == dashboard_id))
    dashboard = result.scalar_one_or_none()
    if not dashboard:
        return JSONResponse(
            status_code=404,
            content={"error": "Dashboard not found"},
        )

    if body.isDefault:
        await db.execute(
            update(Dashboard).values(
                is_default=False,
                updated_at=datetime.now(UTC).replace(tzinfo=None),
            )
        )

    if body.name is not None:
        dashboard.name = body.name
    if body.isDefault is not None:
        dashboard.is_default = body.isDefault
    if body.dateRangeStart is not None:
        dashboard.date_range_start = date_type.fromisoformat(body.dateRangeStart)
    if body.dateRangeEnd is not None:
        dashboard.date_range_end = date_type.fromisoformat(body.dateRangeEnd)
    dashboard.updated_at = datetime.now(UTC).replace(tzinfo=None)

    await db.commit()
    await db.refresh(dashboard)
    return DashboardOut.from_orm_model(dashboard)


@router.delete("/dashboards/{dashboard_id}")
async def delete_dashboard(
    dashboard_id: str,
    db: AsyncSession = Depends(get_db),
):
    await db.execute(delete(Dashboard).where(Dashboard.id == dashboard_id))
    await db.commit()
    return {"success": True}
