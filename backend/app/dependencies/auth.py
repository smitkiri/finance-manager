"""Auth dependency: resolves the current user and household from a JWT.

Demo mode short-circuits: when settings.finance_manager_demo_mode is true,
no token is required and the seeded demo user is returned. Per-request DB
fetch (not in-process cache) because the daily reset wipes and reseeds
the demo row.

`get_current_household_id` resolves the household from the loaded User
row, not from a JWT claim. This guarantees that a token minted before a
household change does not grant access to the old household. The DB hit
is amortized: FastAPI's dependency cache means endpoints that also
depend on `get_current_user` only load the user once.
"""

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.utils.jwt_tokens import InvalidTokenError, decode_access_token


def _parse_bearer(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    return parts[1].strip()


async def get_current_user(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Return the authenticated user, or 401."""
    if settings.finance_manager_demo_mode:
        result = await db.execute(select(User).where(User.id == settings.demo_user_id))
        user = result.scalar_one_or_none()
        if user is None:
            # Demo deploy is misconfigured if this branch fires.
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Demo user not seeded",
            )
        return user

    token = _parse_bearer(authorization)
    try:
        claims = decode_access_token(token)
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        ) from exc
    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    return user


async def get_current_household_id(
    user: User = Depends(get_current_user),
) -> str:
    """Return the current user's household_id.

    Resolves from the loaded User row, not the JWT claim. FastAPI's
    dependency cache means endpoints that also depend on `get_current_user`
    only load the user once per request.
    """
    return user.household_id
