from datetime import datetime
from typing import Any

from pydantic import BaseModel


class SourceOut(BaseModel):
    id: str
    name: str
    householdId: str
    mappings: Any = []
    flipIncomeExpense: bool = False
    createdAt: datetime | None = None
    lastUsed: datetime | None = None

    @classmethod
    def from_orm_model(cls, source) -> SourceOut:
        return cls(
            id=source.id,
            name=source.name,
            householdId=source.household_id,
            mappings=source.mappings,
            flipIncomeExpense=source.flip_income_expense,
            createdAt=source.created_at,
            lastUsed=source.last_used,
        )


class SourceData(BaseModel):
    id: str | None = None
    name: str
    mappings: Any = []
    flipIncomeExpense: bool = False
    createdAt: str | None = None
    lastUsed: str | None = None


class SourceCreateRequest(BaseModel):
    source: SourceData


class SourceUpdateRequest(BaseModel):
    source: SourceData
