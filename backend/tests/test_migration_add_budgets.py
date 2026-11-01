"""Verify the budgets migration creates the table and its unique constraint.

`db_session` is bound to a connection where `alembic upgrade head` has
already run (see conftest._initialize_schema_via_alembic).
"""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.asyncio
async def test_upgrade_creates_budgets_table(db_session: AsyncSession) -> None:
    cols = (
        (
            await db_session.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name = 'budgets'"
                )
            )
        )
        .scalars()
        .all()
    )
    assert set(cols) == {
        "id",
        "household_id",
        "category",
        "effective_month",
        "amount",
        "created_at",
        "updated_at",
    }


@pytest.mark.asyncio
async def test_budgets_unique_per_category_month(db_session: AsyncSession) -> None:
    insert = text(
        "INSERT INTO budgets (id, household_id, category, effective_month, amount) "
        "VALUES (:id, 'household-default', 'Dining', '2026-10-01', 300)"
    )
    await db_session.execute(insert, {"id": "b1"})
    with pytest.raises(IntegrityError):
        await db_session.execute(insert, {"id": "b2"})
