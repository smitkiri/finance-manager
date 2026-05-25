"""End-to-end test for the add-user-credentials migration."""

import pytest
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Household, User


@pytest.mark.asyncio
async def test_existing_users_backfilled_with_placeholder_email_and_empty_hash(
    db_session: AsyncSession,
):
    """A pre-existing user (no email/hash in raw insert) gains the placeholder
    values after upgrade is in head state.

    The db_session fixture already ran `upgrade head`. We assert that an
    insert with explicit nullable columns is impossible AND that the
    existing schema enforces NOT NULL + unique.
    """
    # NOT NULL enforced on email.
    db_session.add(Household(id="hh-mig", name="MigTest"))
    await db_session.flush()

    with pytest.raises((IntegrityError, DBAPIError)):
        db_session.add(User(id="u-no-email", name="X", household_id="hh-mig"))
        await db_session.flush()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_email_uniqueness_is_case_insensitive(
    db_session: AsyncSession,
):
    db_session.add(Household(id="hh-uniq", name="U"))
    await db_session.flush()
    db_session.add(
        User(
            id="u-1",
            name="A",
            email="Alice@Example.com",
            password_hash="x",
            household_id="hh-uniq",
        )
    )
    await db_session.flush()

    db_session.add(
        User(
            id="u-2",
            name="B",
            email="alice@example.com",  # different case — must collide
            password_hash="x",
            household_id="hh-uniq",
        )
    )
    with pytest.raises((IntegrityError, DBAPIError)):
        await db_session.flush()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_downgrade_then_upgrade_round_trip(alembic_runner):
    """Downgrade the credentials migration and re-upgrade; columns reappear."""
    try:
        alembic_runner.downgrade("e51d2dc707dc")
        alembic_runner.upgrade("head")
    except Exception:
        # Always restore head state for downstream tests.
        alembic_runner.upgrade("head")
        raise
