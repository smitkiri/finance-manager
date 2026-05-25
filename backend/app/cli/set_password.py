"""Operator CLI: set or reset a user's password.

Usage:
    python -m app.cli.set_password --user <id-or-email> --password <pw>
        [--email <new-email>]

Used post-A2 deploy to seed real credentials for users that the migration
backfilled with placeholder email + empty hash.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory
from app.models import User
from app.utils.passwords import hash_password

logger = logging.getLogger("cli.set_password")
logging.basicConfig(level=logging.INFO, format="%(message)s")


async def _find_user(db: AsyncSession, identifier: str) -> User | None:
    if "@" in identifier:
        result = await db.execute(
            select(User).where(func.lower(User.email) == identifier.lower())
        )
    else:
        result = await db.execute(select(User).where(User.id == identifier))
    return result.scalar_one_or_none()


async def run(
    db: AsyncSession,
    *,
    user: str,
    email: str | None,
    password: str,
) -> None:
    """Set `password` (and optionally `email`) on the user identified by `user`."""
    target = await _find_user(db, user)
    if target is None:
        logger.error("user not found: %s", user)
        sys.exit(2)

    target.password_hash = hash_password(password)
    if email is not None:
        target.email = email
    await db.commit()
    logger.info("DONE: password set for user %s (email %s)", target.id, target.email)


async def _main() -> None:
    parser = argparse.ArgumentParser(prog="set_password")
    parser.add_argument("--user", required=True, help="User id or email")
    parser.add_argument("--password", required=True, help="New password")
    parser.add_argument("--email", required=False, help="New email (optional)")
    args = parser.parse_args()

    async with async_session_factory() as db:
        await run(db, user=args.user, email=args.email, password=args.password)


if __name__ == "__main__":
    asyncio.run(_main())
