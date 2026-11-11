"""Tests for the `drop teller integration` alembic migration.

The data-preservation test downgrades to the previous revision, seeds a
Teller-linked account with balance history, Teller-imported transactions, an
import session and Teller metadata rows, then upgrades back to head and checks
that only the Teller columns and metadata rows were removed.
"""

import json
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from tests.conftest import get_test_db_url

PREV_REVISION = "c3d9a1e7f5b2"

TELLER_METADATA_KEYS = [
    "teller_enrollments",
    "teller_enrollments:household-default",
    "teller_category_mappings",
    "teller_category_mappings:household-default",
]

TXN_METADATA = {
    "tellerTransactionId": "txn_teller_1",
    "teller": {"details": {"category": "dining", "counterparty": {"name": "Cafe"}}},
}


@pytest.mark.asyncio
async def test_upgrade_drops_teller_columns(db_session: AsyncSession) -> None:
    cols = (
        (
            await db_session.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name = 'accounts'"
                )
            )
        )
        .scalars()
        .all()
    )
    assert "teller_account_id" not in cols
    assert "teller_enrollment_id" not in cols


@pytest.mark.asyncio
async def test_upgrade_preserves_teller_data(alembic_runner) -> None:
    engine = create_async_engine(get_test_db_url(), echo=False)
    try:
        alembic_runner.downgrade(PREV_REVISION)
        async with engine.begin() as conn:
            await conn.execute(
                text(
                    "INSERT INTO accounts (id, household_id, name, type, "
                    "teller_account_id, teller_enrollment_id) "
                    "VALUES ('acct_t', 'household-default', 'Checking', 'asset', "
                    "'acc_teller_1', 'enr_1')"
                )
            )
            for bid, d, bal, note in [
                ("bal_1", "2026-09-01", "1000.00", "Auto-refreshed from Teller"),
                ("bal_2", "2026-10-01", "1250.50", None),
            ]:
                await conn.execute(
                    text(
                        "INSERT INTO account_balances (id, account_id, balance, "
                        "date, note) VALUES (:id, 'acct_t', :bal, :d, :note)"
                    ),
                    {
                        "id": bid,
                        "bal": Decimal(bal),
                        "d": date.fromisoformat(d),
                        "note": note,
                    },
                )
            await conn.execute(
                text(
                    "INSERT INTO import_sessions (id, household_id, source_name, "
                    "transaction_count) "
                    "VALUES ('imp_t', 'household-default', 'Teller: Checking', 1)"
                )
            )
            await conn.execute(
                text(
                    "INSERT INTO transactions (id, date, description, category, "
                    "amount, type, household_id, import_id, metadata) "
                    "VALUES ('txn_t', :d, 'Cafe', 'Dining', :amt, 'expense', "
                    "'household-default', 'imp_t', CAST(:meta AS jsonb))"
                ),
                {
                    "d": date(2026, 10, 5),
                    "amt": Decimal("12.34"),
                    "meta": json.dumps(TXN_METADATA),
                },
            )
            for key in [*TELLER_METADATA_KEYS, "unrelated_key"]:
                await conn.execute(
                    text(
                        "INSERT INTO metadata (key, value) "
                        "VALUES (:k, CAST(:v AS jsonb))"
                    ),
                    {"k": key, "v": json.dumps([{"accessToken": "secret"}])},
                )

        alembic_runner.upgrade("head")

        async with engine.connect() as conn:
            acct = (
                await conn.execute(
                    text(
                        "SELECT name, type, household_id FROM accounts "
                        "WHERE id = 'acct_t'"
                    )
                )
            ).one()
            balances = (
                await conn.execute(
                    text(
                        "SELECT id, balance, date, note FROM account_balances "
                        "WHERE account_id = 'acct_t' ORDER BY id"
                    )
                )
            ).all()
            txn = (
                await conn.execute(
                    text(
                        "SELECT category, amount, import_id, metadata "
                        "FROM transactions WHERE id = 'txn_t'"
                    )
                )
            ).one()
            session_name = (
                await conn.execute(
                    text("SELECT source_name FROM import_sessions WHERE id = 'imp_t'")
                )
            ).scalar_one()
            meta_keys = set(
                (
                    await conn.execute(
                        text("SELECT key FROM metadata WHERE key = ANY(:keys)"),
                        {"keys": [*TELLER_METADATA_KEYS, "unrelated_key"]},
                    )
                )
                .scalars()
                .all()
            )

        assert tuple(acct) == ("Checking", "asset", "household-default")
        assert [tuple(b) for b in balances] == [
            (
                "bal_1",
                Decimal("1000.00"),
                date(2026, 9, 1),
                "Auto-refreshed from Teller",
            ),
            ("bal_2", Decimal("1250.50"), date(2026, 10, 1), None),
        ]
        assert txn.category == "Dining"
        assert txn.amount == Decimal("12.34")
        assert txn.import_id == "imp_t"
        assert txn.metadata == TXN_METADATA
        assert session_name == "Teller: Checking"
        assert meta_keys == {"unrelated_key"}
    finally:
        await engine.dispose()
        async with engine.begin() as conn:
            await conn.execute(text("DELETE FROM transactions WHERE id = 'txn_t'"))
            await conn.execute(text("DELETE FROM import_sessions WHERE id = 'imp_t'"))
            await conn.execute(text("DELETE FROM accounts WHERE id = 'acct_t'"))
            await conn.execute(
                text("DELETE FROM metadata WHERE key = ANY(:keys)"),
                {"keys": [*TELLER_METADATA_KEYS, "unrelated_key"]},
            )
        alembic_runner.upgrade("head")
        await engine.dispose()
