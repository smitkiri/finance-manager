"""Normalize household labels and transaction associations.

Revision ID: a7b9c2d4e6f8
Revises: f2a8d4c6e1b9
Create Date: 2026-11-22

This revision deliberately contains its own frozen normalization/filter code.
Run with application writes quiesced and deploy the matching app together.
"""

import json
from collections.abc import Sequence
from uuid import uuid4

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "a7b9c2d4e6f8"
down_revision: str | Sequence[str] | None = "f2a8d4c6e1b9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_WHITESPACE = " \t\n\r\f\v"
_MAX_NAME_LENGTH = 255
_TRIM_CHARS = "chr(32)||chr(9)||chr(10)||chr(13)||chr(12)||chr(11)"


def _normalize_names(names):
    if names is None:
        return None
    if not isinstance(names, list) or any(not isinstance(name, str) for name in names):
        raise ValueError("label references must be string arrays")
    normalized = sorted(
        {name.strip(_WHITESPACE) for name in names if name.strip(_WHITESPACE)}
    )
    if any(len(name) > _MAX_NAME_LENGTH for name in normalized):
        raise ValueError("label references exceed 255 characters after trimming")
    return normalized


def _normalize_report(filters):
    # SQL/JSON null and absent/null optional label fields mean no filter.
    # Other non-object report filters are malformed and require local repair.
    if filters is None:
        return None
    if not isinstance(filters, dict):
        raise ValueError("report filters must be objects")
    if "labels" not in filters:
        return filters
    return {**filters, "labels": _normalize_names(filters["labels"])}


def _normalize_panel(groups):
    if groups is None:
        return None
    if not isinstance(groups, list):
        raise ValueError("panel filters must be arrays")
    rewritten = []
    for group in groups:
        if not isinstance(group, dict):
            raise ValueError("panel groups must be objects")
        conditions = group.get("conditions")
        if conditions is None:
            rewritten.append(group)
            continue
        if not isinstance(conditions, list):
            raise ValueError("panel conditions must be arrays")
        new_conditions = []
        for condition in conditions:
            if not isinstance(condition, dict):
                raise ValueError("panel conditions must be objects")
            if condition.get("field") == "labels" and "value" in condition:
                condition = {**condition, "value": _normalize_names(condition["value"])}
            new_conditions.append(condition)
        rewritten.append({**group, "conditions": new_conditions})
    return rewritten


def _preflight(connection):
    invalid = connection.execute(
        sa.text("""
        SELECT id, count(*) OVER () AS invalid_count
        FROM transactions
        WHERE labels IS NOT NULL AND (
            jsonb_typeof(labels) IS DISTINCT FROM 'array'
            OR EXISTS (
                SELECT 1 FROM jsonb_array_elements(
                    CASE WHEN jsonb_typeof(labels) = 'array'
                         THEN labels ELSE '[]'::jsonb END
                ) AS element(value)
                WHERE jsonb_typeof(element.value) IS DISTINCT FROM 'string'
            )
        )
        ORDER BY id LIMIT 50
    """)
    ).all()
    errors = []
    if invalid:
        errors.append(
            f"transactions.labels: {invalid[0].invalid_count} malformed rows; "
            f"transaction IDs (up to 50): {[row.id for row in invalid]}"
        )
    overlength = connection.execute(
        sa.text(f"""
        SELECT id, count(*) OVER () AS invalid_count
        FROM transactions
        WHERE EXISTS (
            SELECT 1 FROM jsonb_array_elements(
                CASE WHEN jsonb_typeof(labels) = 'array'
                     THEN labels ELSE '[]'::jsonb END
            ) AS element(value)
            WHERE jsonb_typeof(element.value) = 'string'
              AND char_length(btrim(element.value #>> '{{}}', {_TRIM_CHARS}))
                  > {_MAX_NAME_LENGTH}
        )
        ORDER BY id LIMIT 50
    """)
    ).all()
    if overlength:
        errors.append(
            f"transactions.labels: {overlength[0].invalid_count} overlength rows "
            f"(max {_MAX_NAME_LENGTH} characters after trimming); "
            f"transaction IDs (up to 50): {[row.id for row in overlength]}"
        )
    updates = []
    for table, column, transform in (
        ("reports", "filters", _normalize_report),
        ("dashboard_panels", "filter_groups", _normalize_panel),
    ):
        bad_ids = []
        for row in connection.execute(
            sa.text(f"SELECT id, {column} AS value FROM {table}")
        ):
            try:
                normalized = transform(row.value)
            except ValueError:
                bad_ids.append(row.id)
                continue
            if normalized != row.value:
                updates.append((table, column, row.id, normalized))
        if bad_ids:
            errors.append(
                f"{table}.{column}: {len(bad_ids)} malformed rows; "
                f"IDs (up to 50): {sorted(bad_ids)[:50]}"
            )
    if errors:
        raise ValueError(
            "Labels migration preflight failed. Repair locally: " + "; ".join(errors)
        )
    return updates


def upgrade() -> None:
    connection = op.get_bind()
    updates = _preflight(connection)
    op.create_table(
        "labels",
        sa.Column("id", sa.String(255), primary_key=True),
        sa.Column(
            "household_id",
            sa.String(255),
            sa.ForeignKey("households.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.current_timestamp(),
            nullable=False,
        ),
        sa.Column("created_by", sa.String(10), server_default="user", nullable=False),
        sa.UniqueConstraint("household_id", "name", name="labels_household_name_uniq"),
        sa.CheckConstraint(
            "created_by IN ('user', 'ai')", name="labels_created_by_check"
        ),
        sa.CheckConstraint("name <> ''", name="labels_name_nonempty_check"),
        sa.CheckConstraint("char_length(name) <= 255", name="labels_name_length_check"),
        sa.CheckConstraint(
            f"name = btrim(name, {_TRIM_CHARS})", name="labels_name_trimmed_check"
        ),
    )
    op.create_table(
        "transaction_labels",
        sa.Column(
            "transaction_id",
            sa.String(255),
            sa.ForeignKey("transactions.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "label_id",
            sa.String(255),
            sa.ForeignKey("labels.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )
    op.create_index("idx_transaction_labels_label", "transaction_labels", ["label_id"])
    op.execute(f"""
        CREATE TEMP TABLE _labels_normalized_backfill ON COMMIT DROP AS
        SELECT DISTINCT t.id AS transaction_id, t.household_id,
            btrim(element.value, {_TRIM_CHARS}) AS name
        FROM transactions t
        CROSS JOIN LATERAL jsonb_array_elements_text(
            COALESCE(t.labels, '[]'::jsonb)
        ) AS element(value)
        WHERE btrim(element.value, {_TRIM_CHARS}) <> ''
    """)
    definitions = connection.execute(
        sa.text("SELECT DISTINCT household_id, name FROM _labels_normalized_backfill")
    )
    labels_table = sa.table(
        "labels",
        sa.column("id"),
        sa.column("household_id"),
        sa.column("name"),
        sa.column("created_by"),
    )
    while rows := definitions.fetchmany(1000):
        connection.execute(
            labels_table.insert(),
            [
                {
                    "id": str(uuid4()),
                    "household_id": row.household_id,
                    "name": row.name,
                    "created_by": "user",
                }
                for row in rows
            ],
        )
    op.execute("""
        INSERT INTO transaction_labels (transaction_id, label_id)
        SELECT normalized.transaction_id, l.id
        FROM _labels_normalized_backfill normalized JOIN labels l
          ON l.household_id = normalized.household_id AND l.name = normalized.name
    """)
    # Verify both directions of the complete normalized set before column removal.
    different = connection.scalar(
        sa.text("""
        WITH actual AS (
            SELECT t.id AS transaction_id, t.household_id, l.name
            FROM transaction_labels tl
            JOIN transactions t ON t.id = tl.transaction_id
            JOIN labels l ON l.id = tl.label_id AND l.household_id = t.household_id
        ), mismatch AS (
            (SELECT * FROM _labels_normalized_backfill EXCEPT SELECT * FROM actual)
            UNION ALL
            (SELECT * FROM actual EXCEPT SELECT * FROM _labels_normalized_backfill)
        ) SELECT count(*) FROM mismatch
    """)
    )
    expected_definitions = connection.scalar(
        sa.text(
            "SELECT count(*) FROM (SELECT DISTINCT household_id, name "
            "FROM _labels_normalized_backfill) expected"
        )
    )
    actual_definitions = connection.scalar(sa.text("SELECT count(*) FROM labels"))
    expected_links = connection.scalar(
        sa.text("SELECT count(*) FROM _labels_normalized_backfill")
    )
    actual_links = connection.scalar(sa.text("SELECT count(*) FROM transaction_labels"))
    invalid_links = connection.scalar(
        sa.text("""
        SELECT count(*) FROM transaction_labels tl
        LEFT JOIN transactions t ON t.id = tl.transaction_id
        LEFT JOIN labels l ON l.id = tl.label_id
        WHERE t.id IS NULL OR l.id IS NULL OR t.household_id <> l.household_id
    """)
    )
    if (
        different
        or invalid_links
        or expected_definitions != actual_definitions
        or expected_links != actual_links
    ):
        raise ValueError("Labels migration backfill count/set validation failed")
    for table, column, row_id, value in updates:
        timestamp = "last_modified" if table == "reports" else "updated_at"
        connection.execute(
            sa.text(
                f"UPDATE {table} SET {column} = CAST(:value AS jsonb), "
                f"{timestamp} = CURRENT_TIMESTAMP WHERE id = :id"
            ),
            {"id": row_id, "value": json.dumps(value)},
        )
    op.drop_column("transactions", "labels")


def downgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column(
            "labels",
            postgresql.JSONB(),
            nullable=True,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.execute("""
        UPDATE transactions t SET labels = COALESCE((
            SELECT jsonb_agg(l.name ORDER BY l.name)
            FROM transaction_labels tl JOIN labels l ON l.id = tl.label_id
            WHERE tl.transaction_id = t.id AND l.household_id = t.household_id
        ), '[]'::jsonb)
    """)
    op.drop_table("transaction_labels")
    op.drop_table("labels")
