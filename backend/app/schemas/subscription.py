from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

CadenceLiteral = Literal["weekly", "biweekly", "monthly", "quarterly", "annual"]
StatusLiteral = Literal["active", "possibly_cancelled", "cancelled", "manual"]


class SubscriptionMemberOut(BaseModel):
    id: str
    date: date
    description: str
    amount: float
    category: str
    user: str | None = None


class PriceChangeInfo(BaseModel):
    previous_amount: float
    current_amount: float
    delta_amount: float
    percent_change: float
    period_label: str


class SubscriptionOut(BaseModel):
    id: str
    name: str
    cadence: CadenceLiteral
    expected_amount: float
    status: StatusLiteral
    first_seen: date | None
    last_seen: date | None
    detection_signature: str | None
    user_overrides: dict
    member_count: int = 0
    monthly_normalized_amount: float = 0.0
    price_change: PriceChangeInfo | None = None


class SubscriptionDetailOut(SubscriptionOut):
    members: list[SubscriptionMemberOut] = Field(default_factory=list)


class SubscriptionListResponse(BaseModel):
    subscriptions: list[SubscriptionOut]
    last_detected_at: datetime | None
    total: int


class SubscriptionCreate(BaseModel):
    name: str
    cadence: CadenceLiteral
    expected_amount: float
    transactionIds: list[str] = Field(default_factory=list)


class SubscriptionPatch(BaseModel):
    name: str | None = None
    cadence: CadenceLiteral | None = None
    expected_amount: float | None = None
    status: StatusLiteral | None = None


class SubscriptionMembersBody(BaseModel):
    transactionIds: list[str]


class DetectionQueuedResponse(BaseModel):
    queued: bool = True
    last_detected_at: datetime | None = None
    message: str | None = None
