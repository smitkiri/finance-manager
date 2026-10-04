from typing import Any

from pydantic import BaseModel


class TransferGroupCreate(BaseModel):
    anchorId: str
    memberIds: list[str]


class TransferGroupUpdate(BaseModel):
    memberIds: list[str] | None = None
    includeInCalculations: bool | None = None


class TransferGroupOut(BaseModel):
    id: str
    kind: str
    source: str
    includeInCalculations: bool
    transactions: list[dict[str, Any]]
