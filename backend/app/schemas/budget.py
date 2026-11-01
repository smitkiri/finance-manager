from pydantic import BaseModel, Field, StrictInt, StrictStr


class BudgetSaveRequest(BaseModel):
    category: StrictStr = Field(min_length=1, max_length=255)
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    # Whole dollars; None removes the limit from this month on.
    amount: StrictInt | None = Field(ge=0, le=10_000_000)
