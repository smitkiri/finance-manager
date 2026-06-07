"""drop subscriptions.type column

Revision ID: 2cb102ee30be
Revises: 0ae23d03d325
Create Date: 2026-06-07 11:38:47.683754

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "2cb102ee30be"
down_revision: str | Sequence[str] | None = "0ae23d03d325"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Income subscriptions are no longer supported. Linked transactions are
    # unlinked automatically via the SET NULL FK on transactions.subscription_id.
    op.execute("DELETE FROM subscriptions WHERE type = 'income'")
    op.drop_constraint("subscriptions_type_check", "subscriptions", type_="check")
    op.drop_column("subscriptions", "type")


def downgrade() -> None:
    op.add_column(
        "subscriptions",
        sa.Column(
            "type",
            sa.String(10),
            nullable=False,
            server_default="expense",
        ),
    )
    op.alter_column("subscriptions", "type", server_default=None)
    op.create_check_constraint(
        "subscriptions_type_check",
        "subscriptions",
        "type IN ('expense','income')",
    )
