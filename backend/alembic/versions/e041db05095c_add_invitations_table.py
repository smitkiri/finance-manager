"""add invitations table

Revision ID: e041db05095c
Revises: de0d0d8e93dc
Create Date: 2026-05-27 18:25:53.462071

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e041db05095c"
down_revision: str | Sequence[str] | None = "de0d0d8e93dc"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "invitations",
        sa.Column("id", sa.String(255), primary_key=True),
        sa.Column("household_id", sa.String(255), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("token", sa.Text(), nullable=False),
        sa.Column("invited_by_user_id", sa.String(255), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.TIMESTAMP(), nullable=False),
        sa.Column("consumed_at", sa.TIMESTAMP(), nullable=True),
        sa.Column("revoked_at", sa.TIMESTAMP(), nullable=True),
        sa.ForeignKeyConstraint(
            ["household_id"], ["households.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["invited_by_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.UniqueConstraint("token", name="invitations_token_key"),
    )
    op.create_index("invitations_household_id_idx", "invitations", ["household_id"])
    op.execute(
        "CREATE UNIQUE INDEX invitations_active_one_per_email_per_household "
        "ON invitations (household_id, LOWER(email)) "
        "WHERE consumed_at IS NULL AND revoked_at IS NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS invitations_active_one_per_email_per_household")
    op.drop_index("invitations_household_id_idx", table_name="invitations")
    op.drop_table("invitations")
