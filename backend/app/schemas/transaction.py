from datetime import date
from typing import Any

from pydantic import BaseModel


class TransactionOut(BaseModel):
    id: str
    date: date
    description: str
    category: str
    amount: float
    type: str
    user: str
    labels: list[Any]
    metadata: dict[str, Any]
    transferInfo: dict[str, Any] | None = None
    excludedFromCalculations: bool
    importId: str | None = None

    @classmethod
    def from_orm_model(cls, t) -> TransactionOut:
        return cls(
            id=t.id,
            date=t.date,
            description=t.description,
            category=t.category,
            amount=float(t.amount),
            type=t.type,
            user=t.user_id,
            labels=t.labels or [],
            metadata=t.metadata_ or {},
            transferInfo=t.transfer_info if t.transfer_info else None,
            excludedFromCalculations=t.excluded_from_calculations or False,
            importId=t.import_id,
        )


class TransactionUpdate(BaseModel):
    date: str | None = None
    description: str | None = None
    category: str | None = None
    amount: float | None = None
    type: str | None = None
    user: str | None = None
    labels: list[Any] | None = None
    excludedFromCalculations: bool | None = None
    transferInfo: dict[str, Any] | None = None


class ExpenseBulkItem(BaseModel):
    id: str
    date: str
    description: str
    category: str | None = "Uncategorized"
    amount: float
    type: str
    user: str | None = None
    labels: list[Any] | None = None
    metadata: dict[str, Any] | None = None
    transferInfo: dict[str, Any] | None = None
    excludedFromCalculations: bool | None = False


class ExpenseBulkSaveRequest(BaseModel):
    expenses: list[ExpenseBulkItem]
    metadata: dict[str, Any] | None = None
