"""add budgets table

Revision ID: c3d9a1e7f5b2
Revises: b8e2f4a6c1d3
Create Date: 2026-10-31 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3d9a1e7f5b2"
down_revision: str | Sequence[str] | None = "b8e2f4a6c1d3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "budgets",
        sa.Column("id", sa.String(255), primary_key=True),
        sa.Column(
            "household_id",
            sa.String(255),
            sa.ForeignKey("households.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("category", sa.String(255), nullable=False),
        sa.Column("effective_month", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(15, 2), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.current_timestamp(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.current_timestamp(),
        ),
        sa.UniqueConstraint(
            "household_id",
            "category",
            "effective_month",
            name="budgets_household_category_month_uniq",
        ),
    )
    op.create_index("idx_budgets_household", "budgets", ["household_id"])


def downgrade() -> None:
    op.drop_index("idx_budgets_household", table_name="budgets")
    op.drop_table("budgets")
