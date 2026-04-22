"""baseline

Revision ID: 0d6dcbabe1cc
Revises:
Create Date: 2026-04-21 21:50:08.515167

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0d6dcbabe1cc"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create all tables for finance-manager.

    Uses raw SQL with IF NOT EXISTS so this is safe to run against
    an existing database (it will be a no-op for tables that already exist).
    On a fresh database, it creates the full schema.
    """

    # -- Migration tracking table (no ORM model) --
    op.execute("""
        CREATE TABLE IF NOT EXISTS migrations (
            id SERIAL PRIMARY KEY,
            migration_name VARCHAR(255) UNIQUE NOT NULL,
            executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # -- Categories --
    op.execute("""
        CREATE TABLE IF NOT EXISTS categories (
            name VARCHAR(255) PRIMARY KEY,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # -- Users --
    op.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # -- Sources --
    op.execute("""
        CREATE TABLE IF NOT EXISTS sources (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL UNIQUE,
            mappings JSONB NOT NULL DEFAULT '[]'::jsonb,
            flip_income_expense BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # -- Reports --
    op.execute("""
        CREATE TABLE IF NOT EXISTS reports (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            filters JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # -- Date ranges --
    op.execute("""
        CREATE TABLE IF NOT EXISTS date_ranges (
            id SERIAL PRIMARY KEY,
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(start_date, end_date)
        )
    """)

    # -- Metadata (key-value store) --
    op.execute("""
        CREATE TABLE IF NOT EXISTS metadata (
            key VARCHAR(255) PRIMARY KEY,
            value JSONB NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # -- Import sessions (must come before transactions for FK) --
    op.execute("""
        CREATE TABLE IF NOT EXISTS import_sessions (
            id VARCHAR(255) PRIMARY KEY,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            user_id VARCHAR(255),
            source_id VARCHAR(255),
            source_name VARCHAR(255) NOT NULL,
            file_name VARCHAR(255),
            transaction_count INTEGER NOT NULL DEFAULT 0
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_import_sessions_created_at
        ON import_sessions(created_at DESC)
    """)

    # -- Transactions --
    op.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            id VARCHAR(255) PRIMARY KEY,
            date DATE NOT NULL,
            description TEXT NOT NULL,
            category VARCHAR(255) NOT NULL,
            amount DECIMAL(15, 2) NOT NULL,
            type VARCHAR(10) NOT NULL CHECK (type IN ('expense', 'income')),
            user_id VARCHAR(255) NOT NULL,
            labels JSONB DEFAULT '[]'::jsonb,
            metadata JSONB DEFAULT '{}'::jsonb,
            transfer_info JSONB DEFAULT NULL,
            excluded_from_calculations BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            import_id VARCHAR(255) REFERENCES import_sessions(id) ON DELETE SET NULL
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_transactions_date
        ON transactions(date DESC)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_transactions_user
        ON transactions(user_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_transactions_category
        ON transactions(category)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_transactions_type
        ON transactions(type)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_transactions_excluded
        ON transactions(excluded_from_calculations)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_transactions_import_id
        ON transactions(import_id)
    """)

    # -- Accounts (net worth) --
    op.execute("""
        CREATE TABLE IF NOT EXISTS accounts (
            id VARCHAR(255) PRIMARY KEY,
            user_id VARCHAR(255) NOT NULL,
            name VARCHAR(255) NOT NULL,
            type VARCHAR(20) NOT NULL CHECK (type IN ('asset', 'liability')),
            teller_account_id VARCHAR(255),
            teller_enrollment_id VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_accounts_teller_account_id
        ON accounts(teller_account_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_accounts_teller_enrollment_id
        ON accounts(teller_enrollment_id)
    """)

    # -- Account balances --
    op.execute("""
        CREATE TABLE IF NOT EXISTS account_balances (
            id VARCHAR(255) PRIMARY KEY,
            account_id VARCHAR(255) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            balance DECIMAL(15, 2) NOT NULL,
            date DATE NOT NULL,
            note TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_account_balances_account
        ON account_balances(account_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_account_balances_date
        ON account_balances(date DESC)
    """)

    # -- Dashboards --
    op.execute("""
        CREATE TABLE IF NOT EXISTS dashboards (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            is_default BOOLEAN NOT NULL DEFAULT FALSE,
            date_range_start DATE NOT NULL,
            date_range_end DATE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # -- Dashboard panels --
    op.execute(  # noqa: E501
        """
        CREATE TABLE IF NOT EXISTS dashboard_panels (
            id VARCHAR(255) PRIMARY KEY,
            dashboard_id VARCHAR(255) NOT NULL
                REFERENCES dashboards(id) ON DELETE CASCADE,
            title VARCHAR(255) NOT NULL,
            chart_type VARCHAR(10) NOT NULL
                CHECK (chart_type IN ('bar', 'line')),
            filter_type VARCHAR(10) DEFAULT 'both'
                CHECK (filter_type IN ('expense', 'income', 'both')),
            filter_categories JSONB DEFAULT '[]'::jsonb,
            filter_regex TEXT,
            filter_groups JSONB NOT NULL DEFAULT '[]'::jsonb,
            series_mode VARCHAR(20) DEFAULT 'two_series'
                CHECK (series_mode IN ('two_series', 'net_amount')),
            net_orientation VARCHAR(20)
                CHECK (net_orientation IN ('income_positive', 'expense_positive')),
            legend_options JSONB,
            panel_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_dashboard_panels_dashboard
        ON dashboard_panels(dashboard_id)
    """)


def downgrade() -> None:
    """Drop all tables in reverse dependency order."""
    op.execute("DROP TABLE IF EXISTS dashboard_panels CASCADE")
    op.execute("DROP TABLE IF EXISTS dashboards CASCADE")
    op.execute("DROP TABLE IF EXISTS account_balances CASCADE")
    op.execute("DROP TABLE IF EXISTS accounts CASCADE")
    op.execute("DROP TABLE IF EXISTS transactions CASCADE")
    op.execute("DROP TABLE IF EXISTS import_sessions CASCADE")
    op.execute("DROP TABLE IF EXISTS metadata CASCADE")
    op.execute("DROP TABLE IF EXISTS date_ranges CASCADE")
    op.execute("DROP TABLE IF EXISTS reports CASCADE")
    op.execute("DROP TABLE IF EXISTS sources CASCADE")
    op.execute("DROP TABLE IF EXISTS users CASCADE")
    op.execute("DROP TABLE IF EXISTS categories CASCADE")
    op.execute("DROP TABLE IF EXISTS migrations CASCADE")
