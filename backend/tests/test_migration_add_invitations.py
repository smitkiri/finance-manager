"""Verify the invitations migration creates the table, indexes, and FKs.

`db_session` is bound to a connection where `alembic upgrade head` has
already run (see conftest._initialize_schema_via_alembic). So by the time
the fixture is yielded the invitations table either exists (passing) or
doesn't (failing).
"""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.asyncio
async def test_upgrade_creates_invitations_table(
    db_session: AsyncSession,
) -> None:
    cols = (
        (
            await db_session.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name = 'invitations'"
                )
            )
        )
        .scalars()
        .all()
    )
    assert set(cols) == {
        "id",
        "household_id",
        "email",
        "token",
        "invited_by_user_id",
        "created_at",
        "expires_at",
        "consumed_at",
        "revoked_at",
    }

    indexes = (
        (
            await db_session.execute(
                text("SELECT indexname FROM pg_indexes WHERE tablename = 'invitations'")
            )
        )
        .scalars()
        .all()
    )
    idx_set = set(indexes)
    assert "invitations_household_id_idx" in idx_set
    assert "invitations_active_one_per_email_per_household" in idx_set
    # Either a unique constraint named *_token_key or a unique index covers it
    assert any("token" in name for name in idx_set)


@pytest.mark.asyncio
async def test_partial_unique_index_blocks_duplicate_active(
    db_session: AsyncSession,
) -> None:
    """The partial unique index allows multiple consumed/revoked rows per
    email but blocks two pending rows."""
    await db_session.execute(
        text("INSERT INTO households (id, name) VALUES ('hh-pu1', 'PU')")
    )
    await db_session.execute(
        text(
            "INSERT INTO invitations "
            "(id, household_id, email, token, created_at, expires_at) "
            "VALUES ('i1', 'hh-pu1', 'a@b.com', 'tok-pu-1', now(), "
            "now() + interval '7 days')"
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.execute(
            text(
                "INSERT INTO invitations "
                "(id, household_id, email, token, created_at, expires_at) "
                "VALUES ('i2', 'hh-pu1', 'a@b.com', 'tok-pu-2', now(), "
                "now() + interval '7 days')"
            )
        )


@pytest.mark.asyncio
async def test_partial_unique_index_allows_revoked_then_new_pending(
    db_session: AsyncSession,
) -> None:
    """A revoked invite to the same email should not block a fresh pending
    one — the partial index excludes consumed/revoked rows."""
    await db_session.execute(
        text("INSERT INTO households (id, name) VALUES ('hh-pu2', 'PU2')")
    )
    await db_session.execute(
        text(
            "INSERT INTO invitations "
            "(id, household_id, email, token, created_at, expires_at, revoked_at) "
            "VALUES ('i-rev', 'hh-pu2', 'a@b.com', 'tok-pu-rev', now(), "
            "now() + interval '7 days', now())"
        )
    )
    # Should succeed: only revoked row exists for this email
    await db_session.execute(
        text(
            "INSERT INTO invitations "
            "(id, household_id, email, token, created_at, expires_at) "
            "VALUES ('i-new', 'hh-pu2', 'a@b.com', 'tok-pu-new', now(), "
            "now() + interval '7 days')"
        )
    )
