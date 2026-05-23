"""Tests for the `introduce households` alembic migration.

These tests rely on `conftest.py` running `alembic upgrade head` against the
test container, so by the time `db_session` is yielded the migration has
already been applied.
"""

from decimal import Decimal

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from tests.conftest import get_test_db_url

_TABLES_WITH_HOUSEHOLD = (
    "users",
    "transactions",
    "accounts",
    "import_sessions",
    "categories",
    "sources",
    "dashboards",
    "reports",
    "date_ranges",
)


@pytest.mark.asyncio
async def test_migration_creates_households_and_seeds_one(
    db_session: AsyncSession,
) -> None:
    """After alembic upgrade head, households contains the seeded default row."""
    result = await db_session.execute(text("SELECT id, name FROM households"))
    rows = result.all()
    assert len(rows) == 1
    assert rows[0].id == "household-default"


@pytest.mark.asyncio
async def test_migration_adds_household_id_to_all_tables(
    db_session: AsyncSession,
) -> None:
    """Every data table has a NOT NULL household_id column."""
    for table in _TABLES_WITH_HOUSEHOLD:
        result = await db_session.execute(
            text(
                "SELECT is_nullable FROM information_schema.columns "
                "WHERE table_name = :t AND column_name = 'household_id'"
            ),
            {"t": table},
        )
        row = result.first()
        assert row is not None, f"{table}.household_id missing"
        assert row.is_nullable == "NO", f"{table}.household_id should be NOT NULL"


@pytest.mark.asyncio
async def test_migration_renames_user_id_columns(db_session: AsyncSession) -> None:
    """user_id renamed to created_by_user_id on data tables."""
    for table in ("transactions", "accounts", "import_sessions"):
        result = await db_session.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = :t "
                "AND column_name IN ('user_id', 'created_by_user_id')"
            ),
            {"t": table},
        )
        cols = {r.column_name for r in result.all()}
        assert "created_by_user_id" in cols, f"{table} missing created_by_user_id"
        assert "user_id" not in cols, f"{table} still has user_id"


@pytest.mark.asyncio
async def test_migration_categories_id_pk_and_household_name_unique(
    db_session: AsyncSession,
) -> None:
    """Categories has an id PK and a (household_id, name) unique constraint."""
    result = await db_session.execute(
        text(
            "SELECT column_name FROM information_schema.key_column_usage "
            "WHERE table_name = 'categories' AND constraint_name = 'categories_pkey'"
        )
    )
    pk_cols = {r.column_name for r in result.all()}
    assert pk_cols == {"id"}, f"categories PK should be (id), got {pk_cols}"

    result = await db_session.execute(
        text(
            "SELECT constraint_name FROM information_schema.table_constraints "
            "WHERE table_name = 'categories' "
            "AND constraint_name = 'categories_household_name_uniq'"
        )
    )
    assert result.first() is not None


@pytest.mark.asyncio
async def test_migration_household_fk_constraints(db_session: AsyncSession) -> None:
    """Each data table has a foreign key from household_id to households(id)."""
    for table in _TABLES_WITH_HOUSEHOLD:
        result = await db_session.execute(
            text(
                "SELECT constraint_name FROM information_schema.table_constraints "
                "WHERE table_name = :t AND constraint_name = :name"
            ),
            {"t": table, "name": f"fk_{table}_household"},
        )
        assert result.first() is not None, f"{table} missing fk_{table}_household"


@pytest.mark.asyncio
async def test_migration_preserves_existing_data(alembic_runner) -> None:
    """Pre-existing rows survive the migration and attach to the seed household."""
    engine = create_async_engine(get_test_db_url(), echo=False)
    try:
        # Drop everything and go back to baseline.
        alembic_runner.downgrade("0d6dcbabe1cc")

        async with engine.begin() as conn:
            await conn.execute(
                text("INSERT INTO users (id, name) VALUES ('alice', 'Alice')")
            )
            await conn.execute(
                text(
                    "INSERT INTO accounts (id, user_id, name, type) "
                    "VALUES ('acc1', 'alice', 'Checking', 'asset')"
                )
            )
            await conn.execute(
                text(
                    "INSERT INTO transactions "
                    "(id, date, description, category, amount, type, user_id) "
                    "VALUES ('t1', '2026-01-01', 'Groceries', 'Food', "
                    ":amt, 'expense', 'alice')"
                ),
                {"amt": Decimal("50.00")},
            )
            await conn.execute(text("INSERT INTO categories (name) VALUES ('Food')"))

        # Apply the migration.
        alembic_runner.upgrade("head")

        # Verify the data survived and got attached to the seed household.
        async with engine.connect() as conn:
            result = await conn.execute(
                text(
                    "SELECT id, created_by_user_id, household_id "
                    "FROM transactions WHERE id = 't1'"
                )
            )
            row = result.first()
            assert row is not None
            assert row.created_by_user_id == "alice"
            assert row.household_id == "household-default"

            result = await conn.execute(
                text(
                    "SELECT id, name, household_id FROM categories WHERE name = 'Food'"
                )
            )
            row = result.first()
            assert row is not None
            assert row.id == "Food"
            assert row.household_id == "household-default"
    finally:
        # Restore: clear out the seeded test rows, leave DB at head.
        async with engine.begin() as conn:
            for tbl in (
                "transactions",
                "accounts",
                "categories",
                "users",
            ):
                await conn.execute(text(f"DELETE FROM {tbl}"))
        await engine.dispose()


@pytest.mark.asyncio
async def test_migration_roundtrip(alembic_runner) -> None:
    """Downgrade undoes schema changes; upgrading again restores head."""
    engine = create_async_engine(get_test_db_url(), echo=False)
    try:
        alembic_runner.downgrade("0d6dcbabe1cc")

        async with engine.connect() as conn:
            # household_id should be gone
            result = await conn.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name = 'transactions' AND column_name = 'household_id'"
                )
            )
            assert result.first() is None

            # user_id should be back
            result = await conn.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name = 'transactions' AND column_name = 'user_id'"
                )
            )
            assert result.first() is not None

        alembic_runner.upgrade("head")

        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT id FROM households"))
            row = result.first()
            assert row is not None and row.id == "household-default"
    finally:
        # Make sure we leave the DB at head for subsequent tests.
        alembic_runner.upgrade("head")
        await engine.dispose()
