from datetime import datetime

from pydantic import BaseModel


class ImportSessionOut(BaseModel):
    id: str
    createdAt: datetime
    userId: str | None = None
    sourceId: str | None = None
    sourceName: str
    fileName: str | None = None
    transactionCount: int

    @classmethod
    def from_orm_model(cls, s) -> ImportSessionOut:
        return cls(
            id=s.id,
            createdAt=s.created_at,
            userId=s.user_id,
            sourceId=s.source_id,
            sourceName=s.source_name,
            fileName=s.file_name,
            transactionCount=s.transaction_count,
        )
