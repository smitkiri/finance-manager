"""Pydantic schemas for Teller bank integration endpoints."""

from pydantic import BaseModel


class TellerEnrollmentOut(BaseModel):
    enrollmentId: str | None = None
    institutionName: str | None = None
    connectedAt: str | None = None
    userId: str | None = None


class TellerConfigResponse(BaseModel):
    enabled: bool
    applicationId: str | None = None
    enrollments: list[TellerEnrollmentOut] = []


class EnrollmentTokenResponse(BaseModel):
    accessToken: str


class UpdateTokenRequest(BaseModel):
    accessToken: str


class PreviewAccountsRequest(BaseModel):
    accessToken: str


class TellerAccountPreview(BaseModel):
    id: str
    name: str
    type: str
    subtype: str | None = None


class SelectedAccount(BaseModel):
    tellerAccountId: str
    alias: str
    accountType: str


class EnrollRequest(BaseModel):
    accessToken: str
    userId: str | None = None
    enrollmentId: str | None = None
    institutionName: str | None = None
    selectedAccounts: list[SelectedAccount] = []


class DisconnectRequest(BaseModel):
    enrollmentId: str


class ManageAccountsRequest(BaseModel):
    toAdd: list[SelectedAccount] = []
    toRemove: list[str] = []
    userId: str | None = None


class PreviewImportRequest(BaseModel):
    accountIds: list[str]
    startDate: str
    endDate: str


class ImportTransactionsRequest(BaseModel):
    previewToken: str
    userMappings: dict[str, str] = {}


class CategoryMapping(BaseModel):
    tellerCategory: str
    userCategory: str


class CategoryMappingsUpdateRequest(BaseModel):
    mappings: list[CategoryMapping]
