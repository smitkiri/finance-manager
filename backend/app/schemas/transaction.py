from datetime import date as date_type
from typing import Any

from pydantic import BaseModel


class TransferGroupRef(BaseModel):
    id: str
    role: str
    kind: str
    includeInCalculations: bool


class TransactionOut(BaseModel):
    id: str
    date: date_type
    description: str
    category: str
    amount: float
    type: str
    user: str | None
    householdId: str
    labels: list[Any]
    metadata: dict[str, Any]
    excludedFromCalculations: bool
    importId: str | None = None
    effectiveAmount: float | None = None
    transferGroup: TransferGroupRef | None = None

    @classmethod
    def from_orm_model(cls, t, group=None) -> TransactionOut:
        """Serialize a transaction; pass its `TransferGroup` when it has one."""
        return cls(
            id=t.id,
            date=t.date,
            description=t.description,
            category=t.category,
            amount=float(t.amount),
            type=t.type,
            user=t.created_by_user_id,
            householdId=t.household_id,
            labels=t.labels or [],
            metadata=t.metadata_ or {},
            excludedFromCalculations=t.excluded_from_calculations or False,
            importId=t.import_id,
            effectiveAmount=(
                float(t.effective_amount) if t.effective_amount is not None else None
            ),
            transferGroup=(
                TransferGroupRef(
                    id=group.id,
                    role=t.transfer_role,
                    kind=group.kind,
                    includeInCalculations=group.include_in_calculations,
                )
                if group is not None and t.transfer_group_id == group.id
                else None
            ),
        )


class TransactionUpdate(BaseModel):
    date: date_type | None = None
    description: str | None = None
    category: str | None = None
    amount: float | None = None
    type: str | None = None
    user: str | None = None
    labels: list[Any] | None = None
    excludedFromCalculations: bool | None = None


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
    excludedFromCalculations: bool | None = False


class ExpenseBulkSaveRequest(BaseModel):
    expenses: list[ExpenseBulkItem]
    metadata: dict[str, Any] | None = None
