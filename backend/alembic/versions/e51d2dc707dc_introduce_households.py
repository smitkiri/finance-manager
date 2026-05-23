"""introduce households

Revision ID: e51d2dc707dc
Revises: 0d6dcbabe1cc
Create Date: 2026-05-22 20:38:49.457468

"""

import os
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e51d2dc707dc"
down_revision: str | Sequence[str] | None = "0d6dcbabe1cc"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


SEED_HOUSEHOLD_ID = "household-default"

# Tables that gain a household_id column.
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


def upgrade() -> None:
    # 1. Create households table
    op.execute("""
        CREATE TABLE IF NOT EXISTS households (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 2. Insert seed household; env var lets operators choose the name.
    seed_name = os.environ.get("FINANCE_MANAGER_DEFAULT_HOUSEHOLD_NAME", "Household")
    escaped_name = seed_name.replace("'", "''")
    op.execute(
        f"INSERT INTO households (id, name) "
        f"VALUES ('{SEED_HOUSEHOLD_ID}', '{escaped_name}') "
        f"ON CONFLICT (id) DO NOTHING"
    )

    # 3. Add nullable household_id to all 9 tables
    for table in _TABLES_WITH_HOUSEHOLD:
        op.execute(
            f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS household_id VARCHAR(255)"
        )

    # 4. Backfill all 9 tables to the seed household
    for table in _TABLES_WITH_HOUSEHOLD:
        op.execute(
            f"UPDATE {table} SET household_id = '{SEED_HOUSEHOLD_ID}' "
            f"WHERE household_id IS NULL"
        )

    # 5. Rename user_id -> created_by_user_id on data tables and drop NOT NULL
    # so users can be deleted without cascading row loss (FK becomes SET NULL).
    op.execute("ALTER TABLE transactions RENAME COLUMN user_id TO created_by_user_id")
    op.execute("ALTER TABLE accounts RENAME COLUMN user_id TO created_by_user_id")
    op.execute(
        "ALTER TABLE import_sessions RENAME COLUMN user_id TO created_by_user_id"
    )
    op.execute("ALTER TABLE transactions ALTER COLUMN created_by_user_id DROP NOT NULL")
    op.execute("ALTER TABLE accounts ALTER COLUMN created_by_user_id DROP NOT NULL")

    # Rename matching indexes for consistency
    op.execute(
        "ALTER INDEX IF EXISTS idx_transactions_user "
        "RENAME TO idx_transactions_created_by"
    )
    op.execute(
        "ALTER INDEX IF EXISTS idx_accounts_user RENAME TO idx_accounts_created_by"
    )

    # 6. Categories: surrogate id PK (was: name as PK)
    op.execute("ALTER TABLE categories ADD COLUMN IF NOT EXISTS id VARCHAR(255)")
    op.execute("UPDATE categories SET id = name WHERE id IS NULL")
    op.execute("ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_pkey")
    op.execute("ALTER TABLE categories ALTER COLUMN id SET NOT NULL")
    op.execute("ALTER TABLE categories ADD PRIMARY KEY (id)")
    op.execute(
        "ALTER TABLE categories "
        "ADD CONSTRAINT categories_household_name_uniq UNIQUE (household_id, name)"
    )

    # 7. Sources: replace global unique(name) with composite unique
    op.execute("ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_name_key")
    op.execute(
        "ALTER TABLE sources "
        "ADD CONSTRAINT sources_household_name_uniq UNIQUE (household_id, name)"
    )

    # 8. DateRanges: replace unique(start,end) with composite unique
    op.execute(
        "ALTER TABLE date_ranges "
        "DROP CONSTRAINT IF EXISTS date_ranges_start_date_end_date_key"
    )
    op.execute(
        "ALTER TABLE date_ranges "
        "ADD CONSTRAINT date_ranges_household_dates_uniq "
        "UNIQUE (household_id, start_date, end_date)"
    )

    # 9. NOT NULL all household_id columns
    for table in _TABLES_WITH_HOUSEHOLD:
        op.execute(f"ALTER TABLE {table} ALTER COLUMN household_id SET NOT NULL")

    # 10. Add indexes
    for table in _TABLES_WITH_HOUSEHOLD:
        op.execute(
            f"CREATE INDEX IF NOT EXISTS idx_{table}_household ON {table}(household_id)"
        )

    # 11. FK constraints (ON DELETE RESTRICT)
    for table in _TABLES_WITH_HOUSEHOLD:
        op.execute(
            f"ALTER TABLE {table} "
            f"ADD CONSTRAINT fk_{table}_household "
            f"FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE RESTRICT"
        )


def downgrade() -> None:
    # Reverse order of upgrade()

    # 11. Drop FK constraints
    for table in _TABLES_WITH_HOUSEHOLD:
        op.execute(
            f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS fk_{table}_household"
        )

    # 10. Drop indexes
    for table in _TABLES_WITH_HOUSEHOLD:
        op.execute(f"DROP INDEX IF EXISTS idx_{table}_household")

    # 9. household_id back to nullable
    for table in _TABLES_WITH_HOUSEHOLD:
        op.execute(f"ALTER TABLE {table} ALTER COLUMN household_id DROP NOT NULL")

    # 8. DateRanges uniqueness
    op.execute(
        "ALTER TABLE date_ranges "
        "DROP CONSTRAINT IF EXISTS date_ranges_household_dates_uniq"
    )
    op.execute(
        "ALTER TABLE date_ranges "
        "ADD CONSTRAINT date_ranges_start_date_end_date_key "
        "UNIQUE (start_date, end_date)"
    )

    # 7. Sources uniqueness
    op.execute(
        "ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_household_name_uniq"
    )
    op.execute("ALTER TABLE sources ADD CONSTRAINT sources_name_key UNIQUE (name)")

    # 6. Categories PK back to name
    op.execute(
        "ALTER TABLE categories "
        "DROP CONSTRAINT IF EXISTS categories_household_name_uniq"
    )
    op.execute("ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_pkey")
    op.execute("ALTER TABLE categories ADD PRIMARY KEY (name)")
    op.execute("ALTER TABLE categories DROP COLUMN IF EXISTS id")

    # 5. Restore NOT NULL on created_by_user_id where it originally was, then
    # rename back to user_id.
    op.execute("ALTER TABLE transactions ALTER COLUMN created_by_user_id SET NOT NULL")
    op.execute("ALTER TABLE accounts ALTER COLUMN created_by_user_id SET NOT NULL")
    op.execute(
        "ALTER INDEX IF EXISTS idx_transactions_created_by "
        "RENAME TO idx_transactions_user"
    )
    op.execute(
        "ALTER INDEX IF EXISTS idx_accounts_created_by RENAME TO idx_accounts_user"
    )
    op.execute(
        "ALTER TABLE import_sessions RENAME COLUMN created_by_user_id TO user_id"
    )
    op.execute("ALTER TABLE accounts RENAME COLUMN created_by_user_id TO user_id")
    op.execute("ALTER TABLE transactions RENAME COLUMN created_by_user_id TO user_id")

    # 3. Drop household_id columns
    for table in _TABLES_WITH_HOUSEHOLD:
        op.execute(f"ALTER TABLE {table} DROP COLUMN IF EXISTS household_id")

    # 1. Drop households table
    op.execute("DROP TABLE IF EXISTS households")
