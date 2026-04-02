from pydantic import BaseModel


class TransferOverrideRequest(BaseModel):
    transactionId: str
    includeInCalculations: bool
