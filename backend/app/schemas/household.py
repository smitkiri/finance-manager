from datetime import datetime

from pydantic import BaseModel


class HouseholdOut(BaseModel):
    id: str
    name: str
    createdAt: datetime | None = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_model(cls, h) -> HouseholdOut:
        return cls(id=h.id, name=h.name, createdAt=h.created_at)
