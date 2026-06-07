"""widen subscriptions.status column

Revision ID: 0ae23d03d325
Revises: 701bdc5464c6
Create Date: 2026-06-07 11:01:21.102558

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '0ae23d03d325'
down_revision: str | Sequence[str] | None = '701bdc5464c6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # 'possibly_cancelled' is 18 chars but the original column was VARCHAR(16).
    op.alter_column(
        "subscriptions",
        "status",
        existing_type=sa.String(16),
        type_=sa.String(32),
        existing_nullable=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column(
        "subscriptions",
        "status",
        existing_type=sa.String(32),
        type_=sa.String(16),
        existing_nullable=False,
    )
