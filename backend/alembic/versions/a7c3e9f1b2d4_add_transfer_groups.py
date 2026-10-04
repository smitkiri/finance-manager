"""add transfer_groups and convert legacy transfer_info pairs

Revision ID: a7c3e9f1b2d4
Revises: 2cb102ee30be
Create Date: 2026-10-04 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a7c3e9f1b2d4"
down_revision: str | Sequence[str] | None = "2cb102ee30be"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "transfer_groups",
        sa.Column("id", sa.String(255), primary_key=True),
        sa.Column(
            "household_id",
            sa.String(255),
            sa.ForeignKey("households.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("source", sa.String(10), nullable=False),
        sa.Column(
            "include_in_calculations",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
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
        sa.CheckConstraint(
            "kind IN ('self', 'user')", name="transfer_groups_kind_check"
        ),
        sa.CheckConstraint(
            "source IN ('manual', 'auto')", name="transfer_groups_source_check"
        ),
    )
    op.create_index(
        "idx_transfer_groups_household", "transfer_groups", ["household_id"]
    )

    op.add_column(
        "transactions",
        sa.Column(
            "transfer_group_id",
            sa.String(255),
            sa.ForeignKey("transfer_groups.id", name="fk_transactions_transfer_group"),
            nullable=True,
        ),
    )
    op.add_column(
        "transactions", sa.Column("transfer_role", sa.String(10), nullable=True)
    )
    op.add_column(
        "transactions",
        sa.Column("effective_amount", sa.Numeric(15, 2), nullable=True),
    )
    op.create_check_constraint(
        "transactions_transfer_role_check",
        "transactions",
        "transfer_role IN ('anchor', 'member')",
    )
    op.create_check_constraint(
        "transactions_transfer_group_role_check",
        "transactions",
        "(transfer_group_id IS NULL) = (transfer_role IS NULL)",
    )
    op.create_check_constraint(
        "transactions_effective_amount_check",
        "transactions",
        "transfer_group_id IS NOT NULL OR effective_amount IS NULL",
    )
    op.create_index(
        "idx_transactions_transfer_group", "transactions", ["transfer_group_id"]
    )
    op.create_index(
        "uq_transactions_transfer_group_anchor",
        "transactions",
        ["transfer_group_id"],
        unique=True,
        postgresql_where=sa.text("transfer_role = 'anchor'"),
    )

    _convert_legacy_pairs()


def _convert_legacy_pairs() -> None:
    """Turn legacy `transfer_info` pairs into 1:1 transfer groups.

    Frozen copy of the pairing rules; app code (`adopt_legacy_transfer_info`)
    applies the same rules to legacy backups and the demo fixture.
    """
    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            "SELECT id, household_id, date, type, transfer_info "
            "FROM transactions "
            "WHERE transfer_info->>'isTransfer' = 'true' "
            "AND transfer_info->>'transferId' IS NOT NULL"
        )
    ).all()

    pairs: dict[tuple[str, str], list] = {}
    for r in rows:
        pairs.setdefault((r.household_id, r.transfer_info["transferId"]), []).append(r)

    for (household_id, transfer_id), members in pairs.items():
        if len(members) != 2 or members[0].type == members[1].type:
            continue
        info = members[0].transfer_info
        override = bool(info.get("userOverride"))
        include = override and not info.get("excludedFromCalculations", True)
        kind = "user" if info.get("transferType") == "user" else "self"
        group_id = f"tg_{transfer_id}"
        anchor, member = sorted(members, key=lambda m: (m.date, m.id))

        conn.execute(
            sa.text(
                "INSERT INTO transfer_groups "
                "(id, household_id, kind, source, include_in_calculations) "
                "VALUES (:id, :hid, :kind, :source, :include)"
            ),
            {
                "id": group_id,
                "hid": household_id,
                "kind": kind,
                "source": "manual" if override else "auto",
                "include": include,
            },
        )
        for txn, role in ((anchor, "anchor"), (member, "member")):
            conn.execute(
                sa.text(
                    "UPDATE transactions SET transfer_group_id = :gid, "
                    "transfer_role = :role, effective_amount = :eff WHERE id = :id"
                ),
                {
                    "gid": group_id,
                    "role": role,
                    "eff": None if include else 0,
                    "id": txn.id,
                },
            )


def downgrade() -> None:
    op.drop_index("uq_transactions_transfer_group_anchor", table_name="transactions")
    op.drop_index("idx_transactions_transfer_group", table_name="transactions")
    op.drop_constraint(
        "transactions_effective_amount_check", "transactions", type_="check"
    )
    op.drop_constraint(
        "transactions_transfer_group_role_check", "transactions", type_="check"
    )
    op.drop_constraint(
        "transactions_transfer_role_check", "transactions", type_="check"
    )
    op.drop_constraint(
        "fk_transactions_transfer_group", "transactions", type_="foreignkey"
    )
    op.drop_column("transactions", "effective_amount")
    op.drop_column("transactions", "transfer_role")
    op.drop_column("transactions", "transfer_group_id")
    op.drop_index("idx_transfer_groups_household", table_name="transfer_groups")
    op.drop_table("transfer_groups")
