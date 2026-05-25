"""Authentication endpoints: signup, login, logout, me."""

import secrets

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies.auth import get_current_user
from app.models.household import Household
from app.models.user import User
from app.schemas.auth import AuthResponse, LoginRequest, MeResponse, SignupRequest
from app.schemas.household import HouseholdOut
from app.schemas.user import UserOut
from app.utils.jwt_tokens import encode_access_token
from app.utils.passwords import hash_password, verify_password


def _generate_id() -> str:
    return secrets.token_hex(8)


router = APIRouter(prefix="/api/auth", tags=["auth"])


def _demo_disabled() -> None:
    if settings.finance_manager_demo_mode:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Disabled in demo mode",
        )


async def _email_exists(db: AsyncSession, email: str) -> bool:
    result = await db.execute(
        select(User.id).where(func.lower(User.email) == email.lower()).limit(1)
    )
    return result.scalar_one_or_none() is not None


@router.post("/signup", response_model=AuthResponse)
async def signup(body: SignupRequest, db: AsyncSession = Depends(get_db)):
    _demo_disabled()

    if await _email_exists(db, body.email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    household = Household(
        id=f"hh-{_generate_id()}",
        name=f"{body.name}'s Household",
    )
    db.add(household)
    await db.flush()

    user = User(
        id=f"u-{_generate_id()}",
        name=body.name,
        email=body.email,
        password_hash=hash_password(body.password),
        household_id=household.id,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    await db.refresh(household)

    token = encode_access_token(user_id=user.id, household_id=household.id)
    return AuthResponse(
        token=token,
        user=UserOut.from_orm_model(user),
        household=HouseholdOut.from_orm_model(household),
    )


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    _demo_disabled()

    result = await db.execute(
        select(User).where(func.lower(User.email) == body.email.lower())
    )
    user = result.scalar_one_or_none()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    household = await db.get(Household, user.household_id)
    if household is None:
        # User row with dangling household_id — should be impossible.
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Household missing for user",
        )

    token = encode_access_token(user_id=user.id, household_id=household.id)
    return AuthResponse(
        token=token,
        user=UserOut.from_orm_model(user),
        household=HouseholdOut.from_orm_model(household),
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout():
    # Stateless: client discards its token. Endpoint exists so the frontend
    # has something to call and so a future server-side revocation has a hook.
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=MeResponse)
async def me(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    household = await db.get(Household, user.household_id)
    if household is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Household missing for user",
        )
    return MeResponse(
        user=UserOut.from_orm_model(user),
        household=HouseholdOut.from_orm_model(household),
    )
