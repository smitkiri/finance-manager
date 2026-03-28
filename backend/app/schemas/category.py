from pydantic import BaseModel


class CategoriesSaveRequest(BaseModel):
    categories: list[str]
