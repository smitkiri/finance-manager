import secrets
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.demo.limits import refuse_in_demo_mode
from app.dependencies.auth import get_current_household_id
from app.models import Household, Invitation, User
from app.schemas.user import UserOut

router = APIRouter(prefix="/api", tags=["users"])


def _generate_id() -> str:
    return secrets.token_hex(8)


class UserPatch(BaseModel):
    name: str = Field(min_length=1, max_length=255)


@router.get("/users")
async def get_users(
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(User.household_id == household_id).order_by(User.created_at)
    )
    users = result.scalars().all()
    return {"users": [UserOut.from_orm_model(u) for u in users]}


@router.patch("/users/{user_id}", response_model=UserOut)
async def patch_user(
    user_id: str,
    body: UserPatch,
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    """Rename a user. 404 if the user is not a member of the caller's household."""
    refuse_in_demo_mode()
    result = await db.execute(
        select(User).where(User.id == user_id, User.household_id == household_id)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    user.name = body.name
    await db.commit()
    await db.refresh(user)
    return UserOut.from_orm_model(user)


@router.delete("/users/{user_id}/membership", status_code=204)
async def remove_membership(
    user_id: str,
    current_household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Remove a user from the caller's household.

    The user is moved to a brand-new (empty) household so the FK to
    `users.household_id` stays satisfied. Works for both self-removal
    ("leave") and removing another member.
    """
    if settings.finance_manager_demo_mode:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Disabled in demo mode",
        )

    target = (
        await db.execute(
            select(User).where(
                User.id == user_id,
                User.household_id == current_household_id,
            )
        )
    ).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found in this household")

    now = datetime.now(UTC).replace(tzinfo=None)

    new_household = Household(
        id=f"hh-{_generate_id()}",
        name=f"{target.name}'s Household",
    )
    db.add(new_household)
    await db.flush()

    await db.execute(
        update(User).where(User.id == user_id).values(household_id=new_household.id)
    )
    await db.execute(
        update(Invitation)
        .where(
            Invitation.invited_by_user_id == user_id,
            Invitation.household_id == current_household_id,
            Invitation.consumed_at.is_(None),
            Invitation.revoked_at.is_(None),
        )
        .values(revoked_at=now)
    )
    await db.commit()
    return Response(status_code=204)
