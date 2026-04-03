from pydantic import BaseModel


class RestoreResponse(BaseModel):
    success: bool
    message: str
