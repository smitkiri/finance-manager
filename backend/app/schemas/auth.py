"""Pydantic schemas for /api/auth/*."""

from pydantic import BaseModel, EmailStr, Field

from app.schemas.household import HouseholdOut
from app.schemas.user import UserOut


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=256)
    name: str = Field(min_length=1, max_length=255)
    invite_token: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    """Returned by both /signup and /login."""

    token: str
    user: UserOut
    household: HouseholdOut


class MeResponse(BaseModel):
    user: UserOut
    household: HouseholdOut
