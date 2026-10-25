from pydantic import BaseModel, Field, StrictStr


class EverydayCategoriesRequest(BaseModel):
    categories: list[StrictStr] = Field(max_length=50)
