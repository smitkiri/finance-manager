"""Tests for the `add transfer_groups` alembic migration.

Schema tests rely on `conftest.py` running `alembic upgrade head`. The legacy
conversion test downgrades to the previous revision, seeds legacy
`transfer_info` pairs, and upgrades back to head.
"""

import json
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from tests.conftest import get_test_db_url

PREV_REVISION = "2cb102ee30be"


@pytest.mark.asyncio
async def test_upgrade_creates_transfer_groups_schema(db_session: AsyncSession) -> None:
    cols = (
        (
            await db_session.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name = 'transfer_groups'"
                )
            )
        )
        .scalars()
        .all()
    )
    assert set(cols) == {
        "id",
        "household_id",
        "kind",
        "source",
        "include_in_calculations",
        "created_at",
        "updated_at",
    }

    txn_cols = (
        (
            await db_session.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name = 'transactions' AND column_name IN "
                    "('transfer_group_id', 'transfer_role', 'effective_amount')"
                )
            )
        )
        .scalars()
        .all()
    )
    assert set(txn_cols) == {"transfer_group_id", "transfer_role", "effective_amount"}


async def _seed_group_with_two_anchors(db: AsyncSession) -> None:
    await db.execute(
        text(
            "INSERT INTO transfer_groups (id, household_id, kind, source) "
            "VALUES ('g1', 'household-default', 'self', 'manual')"
        )
    )
    for tid in ("a1", "a2"):
        await db.execute(
            text(
                "INSERT INTO transactions (id, date, description, category, "
                "amount, type, household_id, transfer_group_id, transfer_role) "
                "VALUES (:id, '2024-01-01', 'x', 'c', 10, 'income', "
                "'household-default', 'g1', 'anchor')"
            ),
            {"id": tid},
        )


@pytest.mark.asyncio
async def test_only_one_anchor_per_group(db_session: AsyncSession) -> None:
    with pytest.raises(IntegrityError):
        await _seed_group_with_two_anchors(db_session)


@pytest.mark.asyncio
async def test_role_requires_group(db_session: AsyncSession) -> None:
    with pytest.raises(IntegrityError):
        await db_session.execute(
            text(
                "INSERT INTO transactions (id, date, description, category, "
                "amount, type, household_id, transfer_role) "
                "VALUES ('r1', '2024-01-01', 'x', 'c', 10, 'income', "
                "'household-default', 'member')"
            )
        )


@pytest.mark.asyncio
async def test_effective_amount_requires_group(db_session: AsyncSession) -> None:
    with pytest.raises(IntegrityError):
        await db_session.execute(
            text(
                "INSERT INTO transactions (id, date, description, category, "
                "amount, type, household_id, effective_amount) "
                "VALUES ('e1', '2024-01-01', 'x', 'c', 10, 'income', "
                "'household-default', 5)"
            )
        )


def _legacy_info(transfer_id: str, *, excluded: bool, override: bool) -> str:
    return json.dumps(
        {
            "isTransfer": True,
            "transferId": transfer_id,
            "transferType": "self",
            "excludedFromCalculations": excluded,
            "userOverride": override,
        }
    )


@pytest.mark.asyncio
async def test_upgrade_converts_legacy_transfer_pairs(alembic_runner) -> None:
    engine = create_async_engine(get_test_db_url(), echo=False)
    rows = [
        # (id, date, type, transfer_info)
        (
            "lp_out",
            "2024-02-02",
            "expense",
            _legacy_info("tA", excluded=True, override=False),
        ),
        (
            "lp_in",
            "2024-02-01",
            "income",
            _legacy_info("tA", excluded=True, override=False),
        ),
        (
            "ov_out",
            "2024-03-01",
            "expense",
            _legacy_info("tB", excluded=False, override=True),
        ),
        (
            "ov_in",
            "2024-03-01",
            "income",
            _legacy_info("tB", excluded=False, override=True),
        ),
        (
            "orphan",
            "2024-04-01",
            "expense",
            _legacy_info("tC", excluded=True, override=False),
        ),
    ]
    try:
        alembic_runner.downgrade(PREV_REVISION)
        async with engine.begin() as conn:
            for tid, d, typ, info in rows:
                await conn.execute(
                    text(
                        "INSERT INTO transactions (id, date, description, category, "
                        "amount, type, household_id, created_by_user_id, "
                        "transfer_info) "
                        "VALUES (:id, :d, 'x', 'Transfers', :amt, :typ, "
                        "'household-default', NULL, CAST(:info AS jsonb))"
                    ),
                    {
                        "id": tid,
                        "d": date.fromisoformat(d),
                        "amt": Decimal("100.00"),
                        "typ": typ,
                        "info": info,
                    },
                )
        alembic_runner.upgrade("head")

        async with engine.connect() as conn:
            groups = (
                await conn.execute(
                    text(
                        "SELECT id, kind, source, include_in_calculations "
                        "FROM transfer_groups ORDER BY id"
                    )
                )
            ).all()
            txns = {
                r.id: r
                for r in (
                    await conn.execute(
                        text(
                            "SELECT id, transfer_group_id, transfer_role, "
                            "effective_amount "
                            "FROM transactions WHERE id IN "
                            "('lp_out','lp_in','ov_out','ov_in','orphan')"
                        )
                    )
                ).all()
            }

        assert [
            (g.id, g.kind, g.source, g.include_in_calculations) for g in groups
        ] == [
            ("tg_tA", "self", "auto", False),
            ("tg_tB", "self", "manual", True),
        ]
        # Earlier-dated row anchors; both offset to zero.
        assert txns["lp_in"].transfer_role == "anchor"
        assert txns["lp_out"].transfer_role == "member"
        assert txns["lp_in"].effective_amount == Decimal("0.00")
        assert txns["lp_out"].effective_amount == Decimal("0.00")
        # Same date: tie broken by id ("ov_in" < "ov_out").
        assert txns["ov_in"].transfer_role == "anchor"
        # Included groups count in full.
        assert txns["ov_in"].effective_amount is None
        assert txns["ov_out"].effective_amount is None
        # Unpaired legacy row stays ungrouped.
        assert txns["orphan"].transfer_group_id is None
    finally:
        # Drop the new schema (and its groups) so the seeded legacy rows can be
        # removed, then return to head for the rest of the suite.
        await engine.dispose()
        alembic_runner.downgrade(PREV_REVISION)
        async with engine.begin() as conn:
            await conn.execute(
                text(
                    "DELETE FROM transactions WHERE id IN "
                    "('lp_out','lp_in','ov_out','ov_in','orphan')"
                )
            )
        alembic_runner.upgrade("head")
        await engine.dispose()
