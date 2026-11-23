import asyncio
import json
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi import HTTPException
from sqlalchemy import delete, event, func, insert, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.models import Household, Label, Transaction, TransactionLabel
from app.utils.labels import (
    ensure_labels,
    list_label_definitions,
    load_transaction_label_names,
    normalize_label_names,
    normalize_panel_label_references,
    normalize_report_label_references,
    replace_transaction_labels,
    restore_label_definitions,
    validate_label_definitions,
)
from tests.conftest import get_test_db_url

HH = "household-default"
DATA = json.loads(
    (Path(__file__).parent / "fixtures/labels_migration.json").read_text()
)


async def seed(db, transaction_id="label-service-t", household_id=HH):
    row = Transaction(
        id=transaction_id,
        household_id=household_id,
        date=date(2024, 1, 1),
        description="Synthetic",
        category="Travel",
        amount=Decimal("10.10"),
        type="expense",
    )
    db.add(row)
    await db.flush()
    return row


def test_normalization_has_precise_identity_rules():
    assert normalize_label_names(
        [
            " Flight ",
            "Flight",
            "\t\n\r\f\v",
            "flight",
            "\u00a0Flight\u00a0",
            "New  York",
        ]
    ) == ["Flight", "New  York", "flight", "\u00a0Flight\u00a0"]
    assert normalize_label_names([" \t" + "x" * 255 + "\n"]) == ["x" * 255]
    assert normalize_label_names(["\v" + "😀" * 255 + "\f"]) == ["😀" * 255]
    for overlength in ("x" * 256, "😀" * 256, " \t" + "x" * 256 + "\n"):
        with pytest.raises(ValueError, match="at most 255 characters"):
            normalize_label_names([overlength])
    for invalid in ([None], [7], [{}], "Flight"):
        with pytest.raises(ValueError):
            normalize_label_names(invalid)  # ty: ignore[invalid-argument-type]


def test_runtime_reference_normalization_matches_frozen_migration_fixtures():
    references = DATA["saved_references"]
    assert (
        normalize_report_label_references(references["report"])
        == references["normalized_report"]
    )
    assert (
        normalize_panel_label_references(references["panel"])
        == references["normalized_panel"]
    )
    assert normalize_report_label_references(None) is None
    assert normalize_report_label_references({"labels": None}) == {"labels": None}
    assert normalize_panel_label_references(None) is None
    assert normalize_panel_label_references([{"conditions": None}]) == [
        {"conditions": None}
    ]
    # Whitespace normalization never manufactures a vocabulary definition.
    assert normalize_report_label_references({"labels": [" Unused ", ""]}) == {
        "labels": ["Unused"]
    }


@pytest.mark.parametrize("filters", DATA["malformed_saved_references"]["reports"])
def test_runtime_report_reference_validation_matches_preflight(filters):
    with pytest.raises(ValueError):
        normalize_report_label_references(filters)


@pytest.mark.parametrize("groups", DATA["malformed_saved_references"]["panels"])
def test_runtime_panel_reference_validation_matches_preflight(groups):
    with pytest.raises(ValueError):
        normalize_panel_label_references(groups)


async def test_attach_replace_clear_retain_vocabulary_and_origin(db_session):
    row = await seed(db_session)
    created = await ensure_labels(db_session, HH, ["Flight"], created_by="ai")
    label_id = created["Flight"].id
    await replace_transaction_labels(
        db_session, HH, {row.id: [" Hotel ", "Flight", "Hotel", ""]}
    )
    assert await load_transaction_label_names(db_session, [row]) == {
        row.id: ["Flight", "Hotel"]
    }
    reused = await ensure_labels(db_session, HH, ["Flight"])
    assert reused["Flight"].id == label_id
    assert reused["Flight"].created_by == "ai"
    before = await list_label_definitions(db_session, HH)
    assert [(item["name"], item["usageCount"]) for item in before] == [
        ("Flight", 1),
        ("Hotel", 1),
    ]
    await replace_transaction_labels(db_session, HH, {row.id: []})
    assert await load_transaction_label_names(db_session, [row]) == {row.id: []}
    assert [
        (item["name"], item["usageCount"])
        for item in await list_label_definitions(db_session, HH)
    ] == [("Flight", 0), ("Hotel", 0)]


async def test_ownership_validation_precedes_any_link_or_definition_change(db_session):
    db_session.add(Household(id="label-service-foreign", name="Foreign"))
    await db_session.flush()
    own = await seed(db_session)
    foreign = await seed(db_session, "label-service-foreign-t", "label-service-foreign")
    await replace_transaction_labels(db_session, HH, {own.id: ["Original"]})
    for transaction_id in (foreign.id, "missing"):
        with pytest.raises(HTTPException) as error:
            await replace_transaction_labels(
                db_session, HH, {own.id: ["New"], transaction_id: ["Foreign"]}
            )
        assert error.value.status_code == 404
    assert await load_transaction_label_names(db_session, [own]) == {
        own.id: ["Original"]
    }
    assert [item["name"] for item in await list_label_definitions(db_session, HH)] == [
        "Original"
    ]
    assert await list_label_definitions(db_session, "label-service-foreign") == []


async def test_same_name_scoped_and_corrupt_cross_household_read_is_hidden(db_session):
    db_session.add(Household(id="label-service-foreign", name="Foreign"))
    await db_session.flush()
    row = await seed(db_session)
    own = await ensure_labels(db_session, HH, ["Flight"])
    foreign = await ensure_labels(db_session, "label-service-foreign", ["Flight"])
    assert own["Flight"].id != foreign["Flight"].id
    # The schema intentionally does not promise a composite tenant FK. Reads
    # nevertheless constrain ownership if ad hoc SQL creates a corrupt link.
    db_session.add(
        TransactionLabel(transaction_id=row.id, label_id=foreign["Flight"].id)
    )
    await db_session.flush()
    assert await load_transaction_label_names(db_session, [row]) == {row.id: []}
    catalog = await list_label_definitions(db_session, "label-service-foreign")
    assert catalog[0]["usageCount"] == 0


async def test_rollback_removes_staged_vocabulary_links_and_scalar_changes(db_session):
    row = await seed(db_session)
    with pytest.raises(RuntimeError, match="staged failure"):
        async with db_session.begin_nested():
            row.category = "Changed"
            await replace_transaction_labels(db_session, HH, {row.id: ["Temporary"]})
            raise RuntimeError("staged failure")
    await db_session.refresh(row)
    assert row.category == "Travel"
    assert await list_label_definitions(db_session, HH) == []
    assert await load_transaction_label_names(db_session, [row]) == {row.id: []}


async def test_batch_loading_is_bounded_and_does_not_lazy_load(db_session, monkeypatch):
    monkeypatch.setattr("app.utils.labels.BATCH_SIZE", 2)
    rows = [await seed(db_session, f"label-service-{index}") for index in range(3)]
    await replace_transaction_labels(
        db_session, HH, {row.id: ["Flight"] for row in rows}
    )
    connection = await db_session.connection()
    queries = []

    def record(conn, cursor, statement, parameters, context, many):
        queries.append(statement)

    event.listen(connection.sync_connection, "before_cursor_execute", record)
    try:
        assert await load_transaction_label_names(db_session, rows) == {
            row.id: ["Flight"] for row in rows
        }
        assert await load_transaction_label_names(db_session, []) == {}
    finally:
        event.remove(connection.sync_connection, "before_cursor_execute", record)
    assert len(queries) == 2


async def test_restore_definition_metadata_and_legacy_name_reuse(db_session):
    records = validate_label_definitions(
        [
            {
                "name": " Flight ",
                "created_by": "ai",
                "created_at": "2024-01-01T12:00:00Z",
                "id": "untrusted",
                "household_id": "foreign",
            },
            {"name": "Unused", "created_by": "user"},
        ]
    )
    await restore_label_definitions(db_session, HH, records)
    first = (await ensure_labels(db_session, HH, ["Flight"]))["Flight"]
    assert first.id != "untrusted"
    assert first.household_id == HH
    assert first.created_by == "ai"
    assert first.created_at.isoformat() == "2024-01-01T12:00:00"
    await restore_label_definitions(
        db_session,
        HH,
        [{"name": "Flight", "created_by": "user", "created_at": "2025-01-01"}],
    )
    await db_session.refresh(first)
    assert first.created_by == "ai"
    assert first.created_at.isoformat() == "2024-01-01T12:00:00"
    assert all(
        item["usageCount"] == 0 for item in await list_label_definitions(db_session, HH)
    )


@pytest.mark.parametrize(
    "records",
    [
        None,
        {},
        ["Flight"],
        [{"name": " "}],
        [{"name": 7}],
        [{"name": "Flight", "created_by": "system"}],
        [{"name": "Flight", "created_at": "yesterday"}],
    ],
)
def test_definition_validation_is_pure_and_strict(records):
    with pytest.raises(ValueError):
        validate_label_definitions(records)


async def test_concurrent_same_name_creation_uses_one_definition(db_session):
    # This household is committed on an independent connection. Ordinary test
    # sessions use an outer rollback transaction and cannot prove locking.
    engine = create_async_engine(get_test_db_url())
    async with engine.begin() as connection:
        await connection.execute(
            insert(Household).values(id="label-concurrent", name="Concurrent")
        )

    async def create(origin):
        async with AsyncSession(engine, expire_on_commit=False) as session:
            labels = await ensure_labels(
                session, "label-concurrent", [" Flight "], created_by=origin
            )
            await session.commit()
            return labels["Flight"].id

    try:
        first, second = await asyncio.gather(create("ai"), create("user"))
        assert first == second
        async with AsyncSession(engine) as session:
            assert (
                await session.scalar(
                    select(func.count())
                    .select_from(Label)
                    .where(Label.household_id == "label-concurrent")
                )
                == 1
            )
    finally:
        async with engine.begin() as connection:
            await connection.execute(
                delete(Label).where(Label.household_id == "label-concurrent")
            )
            await connection.execute(
                delete(Household).where(Household.id == "label-concurrent")
            )
        await engine.dispose()
