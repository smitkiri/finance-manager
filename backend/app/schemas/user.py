from datetime import datetime

from pydantic import BaseModel


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    householdId: str
    createdAt: datetime | None = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_model(cls, user) -> UserOut:
        return cls(
            id=user.id,
            name=user.name,
            email=user.email,
            householdId=user.household_id,
            createdAt=user.created_at,
        )
