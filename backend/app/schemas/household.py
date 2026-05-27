from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class HouseholdOut(BaseModel):
    id: str
    name: str
    createdAt: datetime | None = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_model(cls, h) -> HouseholdOut:
        return cls(id=h.id, name=h.name, createdAt=h.created_at)


class HouseholdRenameRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)

    @field_validator("name")
    @classmethod
    def trimmed_non_empty(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Name cannot be empty")
        if len(trimmed) > 100:
            raise ValueError("Name too long")
        return trimmed


class HouseholdSummary(BaseModel):
    transactions: int
    accounts: int
    categories: int
    sources: int
    dashboards: int
    reports: int
