from datetime import datetime
from typing import Any

from pydantic import BaseModel


class ReportOut(BaseModel):
    id: str
    name: str
    householdId: str
    description: str | None = None
    filters: dict[str, Any]
    createdAt: datetime | None = None
    lastModified: datetime | None = None

    @classmethod
    def from_orm_model(cls, r) -> ReportOut:
        return cls(
            id=r.id,
            name=r.name,
            householdId=r.household_id,
            description=r.description,
            filters=r.filters or {},
            createdAt=r.created_at,
            lastModified=r.last_modified,
        )


class ReportData(BaseModel):
    id: str
    name: str
    description: str | None = None
    filters: dict[str, Any] | None = None
    createdAt: str | None = None
    lastModified: str | None = None


class ReportSaveRequest(BaseModel):
    report: ReportData
