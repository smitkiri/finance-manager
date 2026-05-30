"""scope_teller_metadata_by_household

Pre-migration: a single global metadata row `teller_enrollments` (JSON array)
holds enrollments for every household. Post-migration: per-household rows
keyed `teller_enrollments:<household_id>`. Same for `teller_category_mappings`.

Strategy: enrollments → for each enrollment, find the household that owns at
least one Account with a matching `teller_enrollment_id` and bucket the
enrollment there. Enrollments with no matching account fall back to the seed
household so operators don't lose access during the upgrade. Category
mappings: copy the single global row to per-household rows for every
household that has at least one Teller-imported transaction.

The old global rows are left in place; a follow-up revision drops them once
production has confirmed the per-household rows are correct.

Revision ID: d74b19427c55
Revises: e041db05095c
Create Date: 2026-05-30 14:34:16.831282

"""

import json
from collections import defaultdict
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d74b19427c55"
down_revision: str | Sequence[str] | None = "e041db05095c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


SEED_HOUSEHOLD_ID = "household-default"


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Bucket enrollments by household.
    row = conn.execute(
        sa.text("SELECT value FROM metadata WHERE key = 'teller_enrollments'")
    ).fetchone()
    if row is not None and row[0]:
        enrollments = row[0]
        by_household: dict[str, list[dict]] = defaultdict(list)
        for enr in enrollments:
            enr_id = enr.get("enrollmentId")
            if not enr_id:
                continue
            owner = conn.execute(
                sa.text(
                    "SELECT DISTINCT household_id FROM accounts "
                    "WHERE teller_enrollment_id = :eid "
                    "AND household_id IS NOT NULL "
                    "LIMIT 1"
                ),
                {"eid": enr_id},
            ).fetchone()
            household_id = owner[0] if owner is not None else SEED_HOUSEHOLD_ID
            by_household[household_id].append(enr)

        for household_id, enr_list in by_household.items():
            conn.execute(
                sa.text(
                    "INSERT INTO metadata (key, value) VALUES (:k, CAST(:v AS JSONB)) "
                    "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value"
                ),
                {"k": f"teller_enrollments:{household_id}", "v": json.dumps(enr_list)},
            )

    # 2. Category mappings: clone global → per-household for every household
    # that has at least one Teller-imported transaction.
    cat_row = conn.execute(
        sa.text("SELECT value FROM metadata WHERE key = 'teller_category_mappings'")
    ).fetchone()
    if cat_row is not None and cat_row[0]:
        mappings_json = json.dumps(cat_row[0])
        households = conn.execute(
            sa.text(
                "SELECT DISTINCT household_id FROM transactions "
                "WHERE metadata->'teller' IS NOT NULL "
                "AND household_id IS NOT NULL"
            )
        ).fetchall()
        for (household_id,) in households:
            conn.execute(
                sa.text(
                    "INSERT INTO metadata (key, value) VALUES (:k, CAST(:v AS JSONB)) "
                    "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value"
                ),
                {
                    "k": f"teller_category_mappings:{household_id}",
                    "v": mappings_json,
                },
            )

    # The old global rows are intentionally left in place. A follow-up
    # revision should drop them once per-household rows are verified in prod.


def downgrade() -> None:
    """Remove per-household rows. The original global rows are still in
    place from the upgrade, so this leaves the DB in the pre-upgrade shape.
    """
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM metadata WHERE key LIKE 'teller_enrollments:%'"))
    conn.execute(
        sa.text("DELETE FROM metadata WHERE key LIKE 'teller_category_mappings:%'")
    )
