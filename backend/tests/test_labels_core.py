"""Label storage integration through transaction, import and detector paths."""

from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import event, select

from app.models import Household, ImportSession, Label, Transaction, TransactionLabel
from app.utils.labels import load_transaction_label_names, replace_transaction_labels
from app.utils.subscription_utils import _txns_to_dicts
from app.utils.transfer_groups import serialize_transactions
from app.utils.transfer_utils import txns_to_dicts

HH = "household-default"


@pytest.fixture(autouse=True)
def skip_background_connections(monkeypatch):
    monkeypatch.setattr("app.routes.expenses.run_detection_bg", AsyncMock())


async def _seed(db):
    txn = Transaction(
        id="core-original",
        date=date(2024, 1, 1),
        description="Original",
        category="Travel",
        amount=Decimal("12.34"),
        type="expense",
        household_id=HH,
    )
    db.add(txn)
    await db.flush()
    await replace_transaction_labels(db, HH, {txn.id: ["Original"]})
    return txn


def _item(**overrides):
    return {
        "id": "core-original",
        "date": "2024-01-01",
        "description": "Replaced",
        "category": "Travel",
        "amount": 12.34,
        "type": "expense",
        "labels": [" Hotel ", "Flight", "Hotel", "", "flight", "Café"],
        **overrides,
    }


@pytest.mark.parametrize(
    "payload",
    [
        {"description": "Edited"},
        {"description": "Edited", "labels": None},
    ],
)
async def test_patch_omission_and_null_keep_labels(client, db_session, payload):
    await _seed(db_session)
    response = await client.patch("/api/expenses/core-original", json=payload)
    assert response.status_code == 200
    assert response.json()["labels"] == ["Original"]
    assert response.json()["description"] == "Edited"


async def test_patch_clear_retains_unused_vocabulary(client, db_session):
    await _seed(db_session)
    response = await client.patch("/api/expenses/core-original", json={"labels": []})
    assert response.status_code == 200
    assert response.json()["labels"] == []
    assert (await client.get("/api/labels")).json()["labels"] == ["Original"]


async def test_exact_label_query_preserves_non_ascii_whitespace(client, db_session):
    txn = await _seed(db_session)
    name = "\u00a0Flight\u00a0"
    await replace_transaction_labels(db_session, HH, {txn.id: [name]})
    exact = await client.get("/api/expenses", params={"labels": name})
    assert [row["id"] for row in exact.json()] == [txn.id]
    assert (await client.get("/api/expenses", params={"labels": "Flight"})).json() == []


@pytest.mark.parametrize("invalid", [[7], [True], [None], [["Flight"]], {"Flight": 1}])
@pytest.mark.parametrize("operation", ["patch", "replace"])
async def test_invalid_name_types_reject_before_mutation(
    client, db_session, invalid, operation
):
    txn = await _seed(db_session)
    if operation == "patch":
        response = await client.patch(
            "/api/expenses/core-original",
            json={"description": "Changed", "labels": invalid},
        )
    else:
        response = await client.post(
            "/api/expenses", json={"expenses": [_item(labels=invalid)]}
        )
    assert response.status_code == 422
    await db_session.refresh(txn)
    assert txn.description == "Original"
    assert await load_transaction_label_names(db_session, [txn]) == {
        txn.id: ["Original"]
    }


async def test_full_replace_reuses_loaded_ids_and_preserves_vocabulary(
    client, db_session
):
    original = await _seed(db_session)
    original_id = (
        await db_session.scalars(select(Label.id).where(Label.name == "Original"))
    ).one()
    # Four distinct normalized labels deliberately exceed the frontend UI cap.
    response = await client.post("/api/expenses", json={"expenses": [_item()]})
    assert response.status_code == 200
    [row] = (await client.get("/api/expenses")).json()
    assert row["id"] == original.id
    assert row["description"] == "Replaced"
    assert row["labels"] == ["Café", "Flight", "Hotel", "flight"]
    assert (
        await db_session.scalars(select(Label.id).where(Label.name == "Original"))
    ).one() == original_id
    assert (await client.get("/api/labels")).json()["labels"] == [
        "Café",
        "Flight",
        "Hotel",
        "Original",
        "flight",
    ]


@pytest.mark.parametrize("empty_labels", [None, []])
async def test_bulk_null_and_empty_labels_are_unlabeled(
    client, db_session, empty_labels
):
    await _seed(db_session)
    response = await client.post(
        "/api/expenses", json={"expenses": [_item(labels=empty_labels)]}
    )
    assert response.status_code == 200
    assert (await client.get("/api/expenses")).json()[0]["labels"] == []


@pytest.mark.parametrize("operation", ["patch", "replace"])
async def test_name_length_counts_unicode_codepoints_after_ascii_trim(
    client, db_session, operation
):
    await _seed(db_session)
    name = "界" * 255
    payload = {"labels": [f" \t{name}\r\n"]}
    if operation == "patch":
        response = await client.patch("/api/expenses/core-original", json=payload)
    else:
        response = await client.post(
            "/api/expenses", json={"expenses": [_item(**payload)]}
        )
    assert response.status_code == 200
    [row] = (await client.get("/api/expenses")).json()
    assert row["labels"] == [name]


@pytest.mark.parametrize("operation", ["patch", "replace"])
async def test_overlength_names_fail_before_scalar_or_replacement_mutations(
    client, db_session, operation
):
    txn = await _seed(db_session)
    invalid = "界" * 256
    if operation == "patch":
        response = await client.patch(
            "/api/expenses/core-original",
            json={"description": "Changed", "labels": [invalid]},
        )
    else:
        response = await client.post(
            "/api/expenses", json={"expenses": [_item(labels=[invalid])]}
        )
    assert response.status_code == 422
    await db_session.refresh(txn)
    assert txn.description == "Original"
    assert await load_transaction_label_names(db_session, [txn]) == {
        txn.id: ["Original"]
    }
    assert (await client.get("/api/labels")).json()["labels"] == ["Original"]


async def test_bulk_duplicate_ids_rejected_without_deleting_existing(
    client, db_session
):
    await _seed(db_session)
    response = await client.post("/api/expenses", json={"expenses": [_item(), _item()]})
    assert response.status_code == 422
    [row] = (await client.get("/api/expenses")).json()
    assert row["description"] == "Original"
    assert row["labels"] == ["Original"]


async def test_bulk_foreign_id_collision_preserves_both_households(client, db_session):
    original = await _seed(db_session)
    db_session.add(Household(id="core-foreign-hh", name="Other"))
    await db_session.flush()
    foreign = Transaction(
        id="core-foreign",
        date=date(2024, 1, 1),
        description="Foreign",
        category="Travel",
        amount=Decimal("99"),
        type="expense",
        household_id="core-foreign-hh",
    )
    db_session.add(foreign)
    await db_session.flush()
    await replace_transaction_labels(
        db_session, foreign.household_id, {foreign.id: ["Foreign"]}
    )
    response = await client.post(
        "/api/expenses", json={"expenses": [_item(id=foreign.id)]}
    )
    assert response.status_code == 409
    assert await load_transaction_label_names(db_session, [original, foreign]) == {
        original.id: ["Original"],
        foreign.id: ["Foreign"],
    }
    assert (
        await db_session.scalars(select(Label.name).where(Label.household_id == HH))
    ).all() == ["Original"]


async def test_patch_failure_after_label_creation_rolls_back_scalars_and_definitions(
    client, db_session, monkeypatch
):
    txn = await _seed(db_session)

    async def fail_after_labels(*args):
        await replace_transaction_labels(*args)
        raise RuntimeError("Injected label failure")

    monkeypatch.setattr(
        "app.routes.expenses.replace_transaction_labels", fail_after_labels
    )
    with pytest.raises(RuntimeError, match="Injected"):
        async with db_session.begin_nested():
            await client.patch(
                "/api/expenses/core-original",
                json={"description": "Changed", "labels": ["New"]},
            )
    await db_session.refresh(txn)
    assert txn.description == "Original"
    assert await load_transaction_label_names(db_session, [txn]) == {
        txn.id: ["Original"]
    }
    assert (
        await db_session.scalars(select(Label.name).where(Label.household_id == HH))
    ).all() == ["Original"]


async def test_bulk_failure_after_rebuilding_links_rolls_back_all_changes(
    client, db_session, monkeypatch
):
    await _seed(db_session)

    async def fail_after_labels(*args):
        raise RuntimeError("Injected allocation failure")

    monkeypatch.setattr("app.routes.expenses.recompute_groups", fail_after_labels)
    with pytest.raises(RuntimeError, match="Injected"):
        async with db_session.begin_nested():
            await client.post("/api/expenses", json={"expenses": [_item()]})
    [row] = (await client.get("/api/expenses")).json()
    assert row["description"] == "Original"
    assert row["labels"] == ["Original"]
    assert (await client.get("/api/labels")).json()["labels"] == ["Original"]


async def test_detectors_and_serializer_use_the_same_explicit_name_map(db_session):
    txn = await _seed(db_session)
    await replace_transaction_labels(
        db_session, HH, {txn.id: ["Hotel", "Flight", "Hotel"]}
    )
    names = await load_transaction_label_names(db_session, [txn])
    assert txns_to_dicts([txn], names)[0]["labels"] == ["Flight", "Hotel"]
    assert _txns_to_dicts([txn], names)[0]["labels"] == ["Flight", "Hotel"]
    assert (await serialize_transactions(db_session, [txn]))[0]["labels"] == [
        "Flight",
        "Hotel",
    ]


async def test_foreign_association_is_hidden_from_serialization_and_filters(
    client, db_session
):
    txn = await _seed(db_session)
    db_session.add(Household(id="core-hidden-hh", name="Foreign"))
    await db_session.flush()
    foreign_label = Label(
        id="core-hidden-label", household_id="core-hidden-hh", name="PrivateLabel"
    )
    db_session.add(foreign_label)
    await db_session.flush()
    # The scoped schema deliberately relies on application validation for
    # ownership. Simulate ad hoc SQL bypassing it and verify defense on reads.
    db_session.add(TransactionLabel(transaction_id=txn.id, label_id=foreign_label.id))
    await db_session.flush()
    [row] = (await client.get("/api/expenses")).json()
    assert row["labels"] == ["Original"]
    for params in ({"labels": "PrivateLabel"}, {"search": "PrivateLabel"}):
        assert (await client.get("/api/expenses", params=params)).json() == []


async def test_collection_serialization_batches_names_without_per_row_queries(
    db_session,
):
    txn = await _seed(db_session)
    others = [
        Transaction(
            id=f"core-batch-{index}",
            date=date(2024, 1, 2),
            description="Batch",
            category="Travel",
            amount=Decimal("1"),
            type="expense",
            household_id=HH,
        )
        for index in range(20)
    ]
    db_session.add_all(others)
    await db_session.flush()
    statements = []
    connection = await db_session.connection()

    def record(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(connection.sync_connection, "before_cursor_execute", record)
    try:
        rows = await serialize_transactions(db_session, [txn, *others])
    finally:
        event.remove(connection.sync_connection, "before_cursor_execute", record)
    assert len(statements) == 1
    assert rows[0]["labels"] == ["Original"]
    assert all(row["labels"] == [] for row in rows[1:])


@pytest.mark.parametrize("mapped", [False, True])
async def test_import_attaches_before_detection_commit(
    client, db_session, monkeypatch, mapped
):
    await _seed(db_session)
    parsed = [
        {
            "id": "core-import",
            "date": "2024-01-02",
            "description": "Imported",
            "category": "Travel",
            "amount": 10,
            "type": "expense",
            "labels": [" New ", "New"],
        }
    ]

    def parse_mapping(csv, mapping, user, existing):
        assert existing[0]["labels"] == ["Original"]
        return {"expenses": parsed, "autoFilledCategories": []}

    async def detect(db, household_id):
        rows = (
            await db.scalars(select(Transaction).where(Transaction.id == "core-import"))
        ).all()
        assert await load_transaction_label_names(db, rows) == {"core-import": ["New"]}
        await db.commit()
        return {"totalTransactions": 2, "transfersDetected": 0}

    monkeypatch.setattr("app.routes.imports.parse_csv", lambda *args: parsed)
    monkeypatch.setattr("app.routes.imports.parse_csv_with_mapping", parse_mapping)
    monkeypatch.setattr("app.routes.imports.run_detection", detect)
    monkeypatch.setattr("app.routes.imports.run_detection_bg", AsyncMock())
    body = {"csvText": "synthetic", "userId": "default-user"}
    if mapped:
        body["mapping"] = {"name": "Synthetic", "mappings": []}
    response = await client.post(
        "/api/import-with-mapping" if mapped else "/api/import-csv", json=body
    )
    assert response.status_code == 200
    assert response.json()["added"] == 1
    assert (await client.get("/api/labels")).json()["labels"] == ["New", "Original"]


@pytest.mark.parametrize("kind", ["subscriptions", "transfers"])
async def test_detectors_lock_household_before_transaction_mutations(db_session, kind):
    from app.utils.subscription_utils import run_detection as subscriptions
    from app.utils.transfer_groups import create_group
    from app.utils.transfer_utils import run_detection as transfers

    original = await _seed(db_session)
    if kind == "transfers":
        other = Transaction(
            id="core-lock-credit",
            date=date(2024, 1, 2),
            description="Credit",
            category="Travel",
            amount=original.amount,
            type="income",
            household_id=HH,
        )
        db_session.add(other)
        await db_session.flush()
        await create_group(db_session, HH, other.id, [original.id], source="auto")

    statements = []
    connection = await db_session.connection()

    def record(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(connection.sync_connection, "before_cursor_execute", record)
    try:
        await (subscriptions if kind == "subscriptions" else transfers)(
            db_session, household_id=HH, strip_existing=True
        )
    finally:
        event.remove(connection.sync_connection, "before_cursor_execute", record)
    assert "households" in statements[0] and "FOR UPDATE" in statements[0]
    assert (
        next(index for index, sql in enumerate(statements) if "transactions" in sql) > 0
    )
    if kind == "transfers":
        assert any("UPDATE transactions" in sql for sql in statements)
    else:
        assert any("UPDATE households" in sql for sql in statements)


async def test_import_session_delete_locks_before_cascading_labels(
    client, db_session, monkeypatch
):
    txn = await _seed(db_session)
    session = ImportSession(
        id="core-lock-import", source_name="Synthetic", transaction_count=1
    )
    db_session.add(session)
    await db_session.flush()
    txn.import_id = session.id
    await db_session.flush()
    monkeypatch.setattr("app.routes.import_sessions.run_detection_bg", AsyncMock())
    statements = []
    connection = await db_session.connection()

    def record(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(connection.sync_connection, "before_cursor_execute", record)
    try:
        response = await client.delete("/api/import-sessions/core-lock-import")
    finally:
        event.remove(connection.sync_connection, "before_cursor_execute", record)
    assert response.status_code == 200
    assert response.json()["removed"] == 1
    lock = next(index for index, sql in enumerate(statements) if "FOR UPDATE" in sql)
    deletion = next(
        index
        for index, sql in enumerate(statements)
        if "DELETE FROM transactions" in sql
    )
    assert "households" in statements[lock]
    assert lock < deletion
    assert (await client.get("/api/labels")).json()["labels"] == ["Original"]
