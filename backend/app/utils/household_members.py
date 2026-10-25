"""Validate client-supplied user ids used for row attribution.

Routes accept a `user` / `userId` from the client to tag who a transaction
or account belongs to. Without a check, a caller could attribute rows to a
user in another household.
"""

from collections.abc import Iterable

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


async def assert_users_in_household(
    db: AsyncSession,
    household_id: str,
    user_ids: Iterable[str | None],
    *,
    also_allowed: Iterable[str | None] = (),
) -> None:
    """Raise 400 unless every non-empty id is a member of `household_id`.

    `also_allowed` covers ids already attributed on the household's existing
    rows — e.g. a member who has since left — so re-saving untouched rows
    keeps working.
    """
    requested = {u for u in user_ids if u}
    requested -= {u for u in also_allowed if u}
    if not requested:
        return
    result = await db.execute(
        select(User.id).where(User.household_id == household_id, User.id.in_(requested))
    )
    unknown = requested - set(result.scalars().all())
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unknown user for this household",
        )
