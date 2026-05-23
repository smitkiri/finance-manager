from datetime import UTC, datetime
from datetime import date as date_type

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.dashboard import Dashboard, DashboardPanel
from app.models.transaction import Transaction
from app.schemas.dashboard import (
    ChartPreviewRequest,
    DashboardCreateRequest,
    DashboardDataRequest,
    DashboardOut,
    DashboardUpdateRequest,
    PanelCreateRequest,
    PanelOrderRequest,
    PanelOut,
    PanelPreviewRequest,
    PanelUpdateRequest,
)
from app.utils.query_builder import (
    build_filter_groups_clause,
    build_month_series,
    build_panel_data_query,
    build_stats_filter,
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


@router.get("/dashboards/{dashboard_id}/panels")
async def list_panels(
    dashboard_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DashboardPanel)
        .where(DashboardPanel.dashboard_id == dashboard_id)
        .order_by(DashboardPanel.panel_order.asc())
    )
    return [PanelOut.from_orm_model(p) for p in result.scalars().all()]


@router.post("/dashboards/{dashboard_id}/panels", status_code=201)
async def create_panel(
    dashboard_id: str,
    body: PanelCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    count_result = await db.execute(
        select(func.count()).where(DashboardPanel.dashboard_id == dashboard_id)
    )
    if count_result.scalar() >= 15:
        return JSONResponse(
            status_code=400,
            content={"error": "Dashboard has reached the 15-panel limit"},
        )

    panel = DashboardPanel(
        id=body.id,
        dashboard_id=dashboard_id,
        title=body.title,
        chart_type=body.chartType,
        filter_groups=body.filterGroups,
        series_mode=body.seriesMode,
        net_orientation=body.netOrientation,
        legend_options=body.legendOptions,
        panel_order=body.panelOrder,
    )
    db.add(panel)
    await db.commit()
    await db.refresh(panel)
    return PanelOut.from_orm_model(panel)


@router.patch("/dashboard-panels/{panel_id}")
async def update_panel(
    panel_id: str,
    body: PanelUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        return JSONResponse(
            status_code=400,
            content={"error": "Nothing to update"},
        )

    result = await db.execute(
        select(DashboardPanel).where(DashboardPanel.id == panel_id)
    )
    panel = result.scalar_one_or_none()
    if not panel:
        return JSONResponse(
            status_code=404,
            content={"error": "Panel not found"},
        )

    if body.title is not None:
        panel.title = body.title
    if body.chartType is not None:
        panel.chart_type = body.chartType
    if body.filterGroups is not None:
        panel.filter_groups = body.filterGroups
    if body.seriesMode is not None:
        panel.series_mode = body.seriesMode
    if body.netOrientation is not None:
        panel.net_orientation = body.netOrientation
    if body.legendOptions is not None:
        panel.legend_options = body.legendOptions
    if body.panelOrder is not None:
        panel.panel_order = body.panelOrder
    panel.updated_at = datetime.now(UTC).replace(tzinfo=None)

    await db.commit()
    await db.refresh(panel)
    return PanelOut.from_orm_model(panel)


@router.delete("/dashboard-panels/{panel_id}")
async def delete_panel(
    panel_id: str,
    db: AsyncSession = Depends(get_db),
):
    await db.execute(delete(DashboardPanel).where(DashboardPanel.id == panel_id))
    await db.commit()
    return {"success": True}


@router.patch("/dashboards/{dashboard_id}/panel-order")
async def reorder_panels(
    dashboard_id: str,
    body: PanelOrderRequest,
    db: AsyncSession = Depends(get_db),
):
    for index, panel_id in enumerate(body.panelIds):
        await db.execute(
            update(DashboardPanel)
            .where(
                DashboardPanel.id == panel_id,
                DashboardPanel.dashboard_id == dashboard_id,
            )
            .values(
                panel_order=index,
                updated_at=datetime.now(UTC).replace(tzinfo=None),
            )
        )
    await db.commit()
    return {"success": True}


@router.post("/dashboard-panels/preview")
async def panel_preview(
    body: PanelPreviewRequest,
    db: AsyncSession = Depends(get_db),
):
    filters = build_stats_filter(body.dateFrom, body.dateTo, body.userId)

    fg_clause = build_filter_groups_clause(body.filterGroups)
    if fg_clause is not None:
        filters.append(fg_clause)

    count_stmt = select(func.count()).select_from(Transaction).where(*filters)
    count_result = await db.execute(count_stmt)
    total = count_result.scalar()

    data_stmt = (
        select(
            Transaction.id,
            Transaction.date,
            Transaction.description,
            Transaction.category,
            Transaction.amount,
            Transaction.type,
            Transaction.created_by_user_id,
        )
        .where(*filters)
        .order_by(Transaction.date.desc())
        .limit(body.limit)
        .offset(body.offset)
    )
    data_result = await db.execute(data_stmt)
    transactions = [
        {
            "id": row.id,
            "date": str(row.date),
            "description": row.description,
            "category": row.category,
            "amount": float(row.amount),
            "type": row.type,
            "user": row.created_by_user_id,
        }
        for row in data_result.all()
    ]

    return {"transactions": transactions, "total": total}


@router.post("/dashboard-panels/chart-preview")
async def chart_preview(
    body: ChartPreviewRequest,
    db: AsyncSession = Depends(get_db),
):
    stmt, _ = build_panel_data_query(
        date_from=body.dateFrom,
        date_to=body.dateTo,
        user_id=body.userId,
        filter_groups=body.filterGroups,
    )

    result = await db.execute(stmt)
    month_map = build_month_series(body.dateFrom or "", body.dateTo or "")

    rows = [
        {
            "sortMonth": row.sort_month,
            "month": row.month,
            "type": row.type,
            "total": float(row.total),
        }
        for row in result.all()
    ]

    return {"rows": rows, "monthMap": month_map}


@router.post("/dashboards/{dashboard_id}/data")
async def dashboard_data(
    dashboard_id: str,
    body: DashboardDataRequest,
    db: AsyncSession = Depends(get_db),
):
    panel_result = await db.execute(
        select(DashboardPanel)
        .where(DashboardPanel.dashboard_id == dashboard_id)
        .order_by(DashboardPanel.panel_order.asc())
    )
    panels = [PanelOut.from_orm_model(p) for p in panel_result.scalars().all()]

    panel_data_results = []
    for panel in panels:
        stmt, _ = build_panel_data_query(
            date_from=body.dateRangeStart,
            date_to=body.dateRangeEnd,
            user_id=body.userId,
            filter_groups=panel.filterGroups,
        )

        result = await db.execute(stmt)
        month_map = build_month_series(
            body.dateRangeStart or "", body.dateRangeEnd or ""
        )

        for row in result.all():
            key = row.sort_month
            if key not in month_map:
                month_map[key] = {"month": row.month}
            total = float(row.total)
            if panel.seriesMode == "net_amount":
                sign = 1 if row.type == "income" else -1
                month_map[key]["net"] = month_map[key].get("net", 0) + sign * total
            else:
                if row.type == "income":
                    month_map[key]["income"] = total
                else:
                    month_map[key]["expenses"] = total

        sorted_data = [v for _, v in sorted(month_map.items(), key=lambda x: x[0])]

        panel_data_results.append(
            {
                "panelId": panel.id,
                "data": sorted_data,
            }
        )

    return {"panels": panel_data_results}
