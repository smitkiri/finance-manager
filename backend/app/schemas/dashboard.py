from datetime import datetime
from typing import Any

from pydantic import BaseModel


class DashboardOut(BaseModel):
    id: str
    name: str
    isDefault: bool
    dateRangeStart: str
    dateRangeEnd: str
    panelCount: int | None = None
    createdAt: datetime | None = None
    updatedAt: datetime | None = None

    @classmethod
    def from_orm_model(
        cls, d, panel_count: int | None = None
    ) -> DashboardOut:
        return cls(
            id=d.id,
            name=d.name,
            isDefault=d.is_default,
            dateRangeStart=str(d.date_range_start),
            dateRangeEnd=str(d.date_range_end),
            panelCount=panel_count,
            createdAt=d.created_at,
            updatedAt=d.updated_at,
        )


class DashboardCreateRequest(BaseModel):
    id: str
    name: str
    isDefault: bool = False
    dateRangeStart: str
    dateRangeEnd: str


class DashboardUpdateRequest(BaseModel):
    name: str | None = None
    isDefault: bool | None = None
    dateRangeStart: str | None = None
    dateRangeEnd: str | None = None


class PanelOut(BaseModel):
    id: str
    dashboardId: str
    title: str
    chartType: str
    seriesMode: str | None = None
    netOrientation: str | None = None
    legendOptions: Any | None = None
    filterGroups: list[Any] = []
    panelOrder: int = 0
    createdAt: datetime | None = None
    updatedAt: datetime | None = None

    @classmethod
    def from_orm_model(cls, p) -> PanelOut:
        return cls(
            id=p.id,
            dashboardId=p.dashboard_id,
            title=p.title,
            chartType=p.chart_type,
            seriesMode=p.series_mode,
            netOrientation=p.net_orientation,
            legendOptions=p.legend_options,
            filterGroups=p.filter_groups or [],
            panelOrder=p.panel_order,
            createdAt=p.created_at,
            updatedAt=p.updated_at,
        )


class PanelCreateRequest(BaseModel):
    id: str
    title: str
    chartType: str
    filterGroups: list[Any] = []
    seriesMode: str = "two_series"
    netOrientation: str | None = None
    legendOptions: Any | None = None
    panelOrder: int = 0


class PanelUpdateRequest(BaseModel):
    title: str | None = None
    chartType: str | None = None
    filterGroups: list[Any] | None = None
    seriesMode: str | None = None
    netOrientation: str | None = None
    legendOptions: Any | None = None
    panelOrder: int | None = None


class PanelOrderRequest(BaseModel):
    panelIds: list[str]


class PanelPreviewRequest(BaseModel):
    filterGroups: list[Any] = []
    userId: str | None = None
    dateFrom: str | None = None
    dateTo: str | None = None
    limit: int = 10
    offset: int = 0


class ChartPreviewRequest(BaseModel):
    filterGroups: list[Any] = []
    userId: str | None = None
    dateFrom: str | None = None
    dateTo: str | None = None


class DashboardDataRequest(BaseModel):
    userId: str | None = None
    dateRangeStart: str | None = None
    dateRangeEnd: str | None = None
