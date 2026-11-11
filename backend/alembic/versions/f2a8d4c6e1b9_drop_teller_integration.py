"""drop teller integration

Teller is being removed. Linked accounts become regular manual accounts by
dropping their Teller ID columns; their balance history, transactions (incl.
`metadata.teller`) and import sessions are left untouched. Stored enrollments
(access tokens) and category mappings are deleted, including the legacy
global rows left behind by d74b19427c55.

Downgrade re-adds the columns empty; tokens and mappings are not restored
(restore from a pre-migration database dump if needed).

Revision ID: f2a8d4c6e1b9
Revises: c3d9a1e7f5b2
Create Date: 2026-11-10 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f2a8d4c6e1b9"
down_revision: str | Sequence[str] | None = "c3d9a1e7f5b2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "DELETE FROM metadata WHERE key IN "
        "('teller_enrollments', 'teller_category_mappings') "
        "OR key LIKE 'teller\\_enrollments:%' "
        "OR key LIKE 'teller\\_category\\_mappings:%'"
    )
    op.execute("DROP INDEX IF EXISTS idx_accounts_teller_enrollment_id")
    op.execute("DROP INDEX IF EXISTS idx_accounts_teller_account_id")
    op.drop_column("accounts", "teller_enrollment_id")
    op.drop_column("accounts", "teller_account_id")


def downgrade() -> None:
    op.add_column(
        "accounts", sa.Column("teller_account_id", sa.String(255), nullable=True)
    )
    op.add_column(
        "accounts", sa.Column("teller_enrollment_id", sa.String(255), nullable=True)
    )
    op.create_index("idx_accounts_teller_account_id", "accounts", ["teller_account_id"])
    op.create_index(
        "idx_accounts_teller_enrollment_id", "accounts", ["teller_enrollment_id"]
    )
