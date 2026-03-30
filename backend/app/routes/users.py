from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.user import UserOut, UsersSaveRequest

router = APIRouter(prefix="/api", tags=["users"])


def _parse_created_at(value: str | None) -> datetime:
    """Parse an ISO datetime string to a naive UTC datetime for TIMESTAMP columns."""
    if value:
        dt = datetime.fromisoformat(value)
        if dt.tzinfo is not None:
            dt = dt.astimezone(UTC).replace(tzinfo=None)
        return dt
    return datetime.now(UTC).replace(tzinfo=None)


@router.get("/users")
async def get_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).order_by(User.created_at))
    users = result.scalars().all()
    if not users:
        return {
            "users": [
                {
                    "id": "default-user",
                    "name": "Default",
                    "createdAt": datetime.now(UTC).isoformat(),
                }
            ]
        }
    return {"users": [UserOut.from_orm_model(u) for u in users]}


@router.post("/users")
async def save_users(body: UsersSaveRequest, db: AsyncSession = Depends(get_db)):
    await db.execute(delete(User))
    for u in body.users:
        db.add(
            User(
                id=u.id,
                name=u.name,
                created_at=_parse_created_at(u.createdAt),
            )
        )
    await db.commit()
    return {"success": True, "count": len(body.users)}
