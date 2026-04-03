from pydantic import BaseModel


class ImportCsvRequest(BaseModel):
    csvText: str
    fileName: str | None = None
    userId: str | None = None


class ColumnMapping(BaseModel):
    csvColumn: str
    standardColumn: str


class MappingConfig(BaseModel):
    id: str | None = None
    name: str
    flipIncomeExpense: bool = False
    mappings: list[ColumnMapping]


class ImportWithMappingRequest(BaseModel):
    csvText: str
    mapping: MappingConfig
    userId: str
    fileName: str | None = None


class SaveColumnMappingRequest(BaseModel):
    mapping: dict
