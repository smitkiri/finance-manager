from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_household_id
from app.models.user import User
from app.schemas.user import UserOut

router = APIRouter(prefix="/api", tags=["users"])


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
