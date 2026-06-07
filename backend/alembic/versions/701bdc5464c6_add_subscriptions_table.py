"""add subscriptions table

Revision ID: 701bdc5464c6
Revises: d74b19427c55
Create Date: 2026-06-06 22:15:44.434732

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "701bdc5464c6"
down_revision: str | Sequence[str] | None = "d74b19427c55"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "subscriptions",
        sa.Column("id", sa.String(255), primary_key=True),
        sa.Column("household_id", sa.String(255), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("cadence", sa.String(16), nullable=False),
        sa.Column("expected_amount", sa.Numeric(15, 2), nullable=False),
        sa.Column("type", sa.String(10), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("first_seen", sa.Date(), nullable=True),
        sa.Column("last_seen", sa.Date(), nullable=True),
        sa.Column("detection_signature", sa.Text(), nullable=True),
        sa.Column(
            "user_overrides",
            sa.dialects.postgresql.JSONB(),
            nullable=False,
            server_default=sa.text(
                """'{"excludedTxnIds": [], "includedTxnIds": [], """
                """"lockName": false, "lockAmount": false, """
                """"lockCadence": false}'::jsonb"""
            ),
        ),
        sa.Column(
            "metadata",
            sa.dialects.postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["household_id"], ["households.id"], ondelete="RESTRICT"
        ),
        sa.CheckConstraint(
            "cadence IN ('weekly','biweekly','monthly','quarterly','annual')",
            name="subscriptions_cadence_check",
        ),
        sa.CheckConstraint(
            "type IN ('expense','income')",
            name="subscriptions_type_check",
        ),
        sa.CheckConstraint(
            "status IN ('active','possibly_cancelled','cancelled','manual')",
            name="subscriptions_status_check",
        ),
    )
    op.create_index("idx_subscriptions_household", "subscriptions", ["household_id"])
    op.create_index(
        "idx_subscriptions_household_status",
        "subscriptions",
        ["household_id", "status"],
    )
    op.execute(
        "CREATE INDEX idx_subscriptions_household_signature "
        "ON subscriptions (household_id, detection_signature) "
        "WHERE detection_signature IS NOT NULL"
    )

    op.add_column(
        "transactions",
        sa.Column("subscription_id", sa.String(255), nullable=True),
    )
    op.create_foreign_key(
        "transactions_subscription_id_fkey",
        "transactions",
        "subscriptions",
        ["subscription_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "idx_transactions_subscription_id",
        "transactions",
        ["subscription_id"],
    )

    op.add_column(
        "households",
        sa.Column("last_subscription_detection_at", sa.TIMESTAMP(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("households", "last_subscription_detection_at")
    op.drop_index("idx_transactions_subscription_id", table_name="transactions")
    op.drop_constraint(
        "transactions_subscription_id_fkey", "transactions", type_="foreignkey"
    )
    op.drop_column("transactions", "subscription_id")
    op.execute("DROP INDEX IF EXISTS idx_subscriptions_household_signature")
    op.drop_index("idx_subscriptions_household_status", table_name="subscriptions")
    op.drop_index("idx_subscriptions_household", table_name="subscriptions")
    op.drop_table("subscriptions")
