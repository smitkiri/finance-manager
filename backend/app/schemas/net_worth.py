from datetime import datetime

from pydantic import BaseModel


class AccountOut(BaseModel):
    id: str
    userId: str | None = None
    householdId: str
    name: str
    type: str
    tellerAccountId: str | None = None
    tellerEnrollmentId: str | None = None
    createdAt: datetime | None = None
    updatedAt: datetime | None = None

    @classmethod
    def from_orm_model(cls, a) -> AccountOut:
        return cls(
            id=a.id,
            userId=a.created_by_user_id,
            householdId=a.household_id,
            name=a.name,
            type=a.type,
            tellerAccountId=a.teller_account_id,
            tellerEnrollmentId=a.teller_enrollment_id,
            createdAt=a.created_at,
            updatedAt=a.updated_at,
        )


class AccountCreateRequest(BaseModel):
    id: str
    userId: str | None = None
    name: str
    type: str


class AccountUpdateRequest(BaseModel):
    name: str
    type: str


class AccountBalanceOut(BaseModel):
    id: str
    accountId: str
    balance: float
    date: str
    note: str | None = None
    createdAt: datetime | None = None

    @classmethod
    def from_orm_model(cls, b) -> AccountBalanceOut:
        return cls(
            id=b.id,
            accountId=b.account_id,
            balance=float(b.balance),
            date=str(b.date),
            note=b.note,
            createdAt=b.created_at,
        )


class BalanceCreateRequest(BaseModel):
    id: str
    balance: float
    date: str
    note: str | None = None


class NetWorthSummary(BaseModel):
    totalAssets: float
    totalLiabilities: float
    netWorth: float


class NetWorthHistoryPoint(BaseModel):
    date: str
    totalAssets: float
    totalLiabilities: float
    netWorth: float
