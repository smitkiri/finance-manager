from pydantic import BaseModel


class DateRangeRequest(BaseModel):
    start: str
    end: str
