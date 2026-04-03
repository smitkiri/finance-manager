from pydantic import BaseModel


class DeleteSelectedRequest(BaseModel):
    deleteTransactions: bool = False
    deleteSources: bool = False
    sourceIds: list[str] | None = None


class UndoImportRequest(BaseModel):
    sessionId: str
