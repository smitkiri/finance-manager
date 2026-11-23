from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.models import Label, Transaction, TransactionLabel
from app.utils.labels import ensure_labels, replace_transaction_labels

HH = "household-default"


@pytest.mark.parametrize(
    "name",
    [
        "",
        " Flight",
        "Flight ",
        "\tFlight",
        "Flight\n",
        "\rFlight",
        "Flight\f",
        "\vFlight",
    ],
)
async def test_database_rejects_noncanonical_names(db_session, name):
    with pytest.raises(IntegrityError):
        async with db_session.begin_nested():
            db_session.add(Label(id="invalid-label", household_id=HH, name=name))
            await db_session.flush()


async def test_database_enforces_exact_case_sensitive_uniqueness_and_origin(db_session):
    labels = await ensure_labels(
        db_session, HH, ["Flight", "flight", "\u00a0Flight\u00a0", "😀" * 255]
    )
    assert len(labels) == 4
    with pytest.raises(IntegrityError):
        async with db_session.begin_nested():
            db_session.add(
                Label(id="overlength-label", household_id=HH, name="😀" * 256)
            )
            await db_session.flush()
    with pytest.raises(IntegrityError):
        async with db_session.begin_nested():
            db_session.add(Label(id="duplicate-label", household_id=HH, name="Flight"))
            await db_session.flush()
    with pytest.raises(IntegrityError):
        async with db_session.begin_nested():
            db_session.add(
                Label(
                    id="bad-origin", household_id=HH, name="Other", created_by="system"
                )
            )
            await db_session.flush()


async def test_join_primary_key_cascades_and_reverse_lookup_index(db_session):
    row = Transaction(
        id="label-schema-row",
        household_id=HH,
        date=date(2024, 1, 1),
        description="Synthetic",
        category="Travel",
        amount=Decimal("10"),
        type="expense",
    )
    db_session.add(row)
    await db_session.flush()
    await replace_transaction_labels(db_session, HH, {row.id: ["Flight"]})
    label = (await ensure_labels(db_session, HH, ["Flight"]))["Flight"]
    with pytest.raises(IntegrityError):
        async with db_session.begin_nested():
            db_session.add(TransactionLabel(transaction_id=row.id, label_id=label.id))
            await db_session.flush()
    indexes = (
        (
            await db_session.execute(
                text(
                    "SELECT indexdef FROM pg_indexes "
                    "WHERE tablename='transaction_labels'"
                )
            )
        )
        .scalars()
        .all()
    )
    assert any(
        "(transaction_id, label_id)" in definition and "UNIQUE" in definition
        for definition in indexes
    )
    assert any("(label_id)" in definition for definition in indexes)
    await db_session.delete(row)
    await db_session.flush()
    assert (await db_session.scalars(select(TransactionLabel))).all() == []
    assert await db_session.get(Label, label.id) is not None
    # Definitions cascade their own links independently of transaction deletion.
    other = Transaction(
        id="label-schema-other",
        household_id=HH,
        date=date(2024, 1, 1),
        description="Synthetic",
        category="Travel",
        amount=Decimal("10"),
        type="expense",
    )
    db_session.add(other)
    await db_session.flush()
    await replace_transaction_labels(db_session, HH, {other.id: ["Flight"]})
    await db_session.delete(label)
    await db_session.flush()
    assert (await db_session.scalars(select(TransactionLabel))).all() == []
    assert await db_session.get(Transaction, other.id) is not None
