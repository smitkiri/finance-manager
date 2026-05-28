"""Pydantic schemas for /api/invitations endpoints."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class InvitationInviter(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str


class InvitationCreateRequest(BaseModel):
    email: EmailStr


InvitationStatus = Literal["pending", "consumed", "revoked", "expired"]


class InvitationListItem(BaseModel):
    """Shape returned by GET /api/invitations. POST adds `token` (see
    InvitationCreated)."""

    model_config = ConfigDict(populate_by_name=True)

    id: str
    email: str
    status: InvitationStatus
    created_at: datetime = Field(serialization_alias="createdAt")
    expires_at: datetime = Field(serialization_alias="expiresAt")
    invited_by: InvitationInviter | None = Field(
        default=None, serialization_alias="invitedBy"
    )


class InvitationCreated(InvitationListItem):
    """POST /api/invitations response — adds the raw token (the only
    response that exposes it)."""

    token: str


class InvitationAcceptRequest(BaseModel):
    token: str


class InvitationLookupResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    household_name: str = Field(serialization_alias="householdName")
    inviter_name: str | None = Field(serialization_alias="inviterName")
    email: str
    status: InvitationStatus
    expires_at: datetime = Field(serialization_alias="expiresAt")
