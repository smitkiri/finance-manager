"""add user credentials

Revision ID: de0d0d8e93dc
Revises: e51d2dc707dc
Create Date: 2026-05-25 16:35:29.659543

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "de0d0d8e93dc"
down_revision: str | Sequence[str] | None = "e51d2dc707dc"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Add columns as NULLABLE so existing rows survive.
    op.execute("ALTER TABLE users ADD COLUMN email TEXT")
    op.execute("ALTER TABLE users ADD COLUMN password_hash TEXT")

    # 2. Backfill placeholder values. Operator runs the set_password CLI
    # immediately after deploy to set real emails + hashes for these rows.
    op.execute(
        "UPDATE users SET email = id || '@placeholder.local' WHERE email IS NULL"
    )
    op.execute("UPDATE users SET password_hash = '' WHERE password_hash IS NULL")

    # 3. Enforce NOT NULL.
    op.execute("ALTER TABLE users ALTER COLUMN email SET NOT NULL")
    op.execute("ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL")

    # 4. Case-insensitive unique index on email.
    op.execute("CREATE UNIQUE INDEX users_email_lower_idx ON users (LOWER(email))")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS users_email_lower_idx")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS password_hash")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS email")
