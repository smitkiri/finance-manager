import json
from datetime import datetime

import pytest
from sqlalchemy import func, select

from app.models import Household, ImportSession, Label, Transaction, TransactionLabel
from app.utils.labels import ensure_labels, load_transaction_label_names

HOUSEHOLD = "household-default"


def transaction(tid="backup-labels", labels=None):
    return {
        "id": tid,
        "date": "2024-01-15",
        "description": "Synthetic backup transaction",
        "category": "Travel",
        "amount": 10.25,
        "type": "expense",
        "labels": labels if labels is not None else [" Hotel ", "Flight", "Flight"],
    }


async def restore(client, data):
    return await client.post(
        "/api/restore",
        files={
            "backupFile": ("backup.json", json.dumps(data).encode(), "application/json")
        },
    )


async def test_backup_round_trip_preserves_attached_unused_and_origin(
    client, db_session
):
    original = {
        "transactions": [transaction()],
        "labels": [
            {"name": "Unused", "created_by": "ai", "created_at": "2024-01-01T12:00:00Z"}
        ],
    }
    assert (await restore(client, original)).status_code == 200
    exported = (await client.get("/api/backup")).json()
    assert exported["transactions"][0]["labels"] == ["Flight", "Hotel"]
    assert exported["labels"] == [
        {
            "name": "Flight",
            "created_at": exported["labels"][0]["created_at"],
            "created_by": "user",
        },
        {
            "name": "Hotel",
            "created_at": exported["labels"][1]["created_at"],
            "created_by": "user",
        },
        {"name": "Unused", "created_at": "2024-01-01T12:00:00", "created_by": "ai"},
    ]
    assert all(
        set(record) == {"name", "created_at", "created_by"}
        for record in exported["labels"]
    )
    assert (await client.delete("/api/delete-all")).status_code == 200
    assert (await restore(client, exported)).status_code == 200
    assert (await restore(client, exported)).status_code == 200
    after = (await client.get("/api/backup")).json()
    assert after["labels"] == exported["labels"]
    assert after["transactions"][0]["labels"] == ["Flight", "Hotel"]
    assert (
        await db_session.scalar(select(func.count()).select_from(TransactionLabel)) == 2
    )


async def test_date_limited_backup_retains_whole_vocabulary(client):
    assert (
        await restore(
            client, {"transactions": [transaction()], "labels": [{"name": "Unused"}]}
        )
    ).status_code == 200
    exported = (
        await client.get("/api/backup", params={"dateFrom": "2025-01-01"})
    ).json()
    assert exported["transactions"] == []
    assert {record["name"] for record in exported["labels"]} == {
        "Flight",
        "Hotel",
        "Unused",
    }


async def test_skipped_existing_and_foreign_ids_never_change_links(client, db_session):
    assert (await restore(client, {"transactions": [transaction()]})).status_code == 200
    db_session.add(Household(id="backup-foreign", name="Foreign"))
    await db_session.flush()
    db_session.add(
        Transaction(
            id="foreign-collision",
            household_id="backup-foreign",
            date=datetime(2024, 1, 1).date(),
            description="Synthetic",
            category="Travel",
            amount=50,
            type="expense",
        )
    )
    await db_session.flush()
    await ensure_labels(db_session, "backup-foreign", ["ForeignUnused"])
    payload = {
        "transactions": [
            transaction(labels=["SkippedNew"]),
            transaction("foreign-collision", ["SkippedForeign"]),
        ],
        "labels": [
            {
                "name": "ExplicitUnused",
                "id": "uploaded-id",
                "household_id": "backup-foreign",
                "created_by": "ai",
            }
        ],
    }
    assert (await restore(client, payload)).status_code == 200
    current = await db_session.get(Transaction, "backup-labels")
    foreign = await db_session.get(Transaction, "foreign-collision")
    assert await load_transaction_label_names(db_session, [current, foreign]) == {
        "backup-labels": ["Flight", "Hotel"],
        "foreign-collision": [],
    }
    definitions = (
        await db_session.scalars(select(Label).where(Label.household_id == HOUSEHOLD))
    ).all()
    assert {label.name for label in definitions} == {
        "Flight",
        "Hotel",
        "ExplicitUnused",
    }
    assert all(label.id != "uploaded-id" for label in definitions)
    assert (
        await db_session.get(Transaction, "foreign-collision")
    ).household_id == "backup-foreign"


async def test_conflicting_definition_preserves_existing_metadata(client, db_session):
    labels = await ensure_labels(db_session, HOUSEHOLD, ["Original"], created_by="ai")
    created = labels["Original"].created_at
    assert (
        await restore(
            client,
            {
                "labels": [
                    {
                        "name": "Original",
                        "created_by": "user",
                        "created_at": "2000-01-01",
                    }
                ]
            },
        )
    ).status_code == 200
    await db_session.refresh(labels["Original"])
    assert labels["Original"].created_by == "ai"
    assert labels["Original"].created_at == created


@pytest.mark.parametrize(
    "invalid",
    [
        None,
        {},
        [None],
        [{"name": " "}],
        [{"name": 1}],
        [{"name": "Okay", "created_by": "admin"}],
        [{"name": "Okay", "created_at": "invalid"}],
    ],
)
async def test_invalid_vocabulary_rejected_before_any_insert(
    client, db_session, invalid
):
    response = await restore(
        client, {"labels": invalid, "transactions": [transaction()]}
    )
    assert response.status_code == 422
    assert await db_session.scalar(select(func.count()).select_from(Transaction)) == 0
    assert await db_session.scalar(select(func.count()).select_from(Label)) == 0


@pytest.mark.parametrize("invalid", ["Flight", {}, False, 1, ["Flight", 7], [None]])
async def test_invalid_transaction_labels_rejected_before_vocabulary_insert(
    client, db_session, invalid
):
    response = await restore(
        client,
        {
            "labels": [{"name": "ShouldRollback"}],
            "transactions": [transaction(labels=invalid)],
        },
    )
    assert response.status_code == 422
    assert await db_session.scalar(select(func.count()).select_from(Label)) == 0


@pytest.mark.parametrize(
    "route,method,body",
    [
        ("/api/delete-all", "DELETE", None),
        ("/api/delete-selected", "POST", {"deleteTransactions": True}),
    ],
)
async def test_explicit_clear_removes_only_own_vocabulary(
    client, db_session, route, method, body
):
    await ensure_labels(db_session, HOUSEHOLD, ["Unused"])
    db_session.add(Household(id="clear-foreign", name="Foreign"))
    await db_session.flush()
    await ensure_labels(db_session, "clear-foreign", ["Unused"])
    response = await client.request(method, route, json=body)
    assert response.status_code == 200
    remaining = (await db_session.scalars(select(Label))).all()
    assert [(label.household_id, label.name) for label in remaining] == [
        ("clear-foreign", "Unused")
    ]


async def test_undo_import_cascades_links_and_retains_unused_definitions(
    client, db_session
):
    db_session.add(
        ImportSession(id="labels-import", source_name="Synthetic", transaction_count=1)
    )
    await db_session.flush()
    assert (await restore(client, {"transactions": [transaction()]})).status_code == 200
    imported = await db_session.get(Transaction, "backup-labels")
    imported.import_id = "labels-import"
    await db_session.flush()
    response = await client.post(
        "/api/undo-import", json={"sessionId": "labels-import"}
    )
    assert response.status_code == 200
    assert response.json()["removed"] == 1
    assert (
        await db_session.scalar(select(func.count()).select_from(TransactionLabel)) == 0
    )
    assert set((await client.get("/api/labels")).json()["labels"]) == {
        "Flight",
        "Hotel",
    }


async def test_report_upsert_cannot_rewrite_foreign_label_references(
    client, db_session
):
    from app.models import Report

    db_session.add(Household(id="report-foreign", name="Foreign"))
    await db_session.flush()
    db_session.add(
        Report(
            id="foreign-report",
            household_id="report-foreign",
            name="Foreign",
            filters={"labels": ["Foreign"]},
        )
    )
    await db_session.flush()
    response = await client.post(
        "/api/reports",
        json={
            "report": {
                "id": "foreign-report",
                "name": "Overwrite",
                "filters": {"labels": ["Local"]},
            }
        },
    )
    assert response.status_code == 404
    report = await db_session.get(Report, "foreign-report")
    await db_session.refresh(report)
    assert report.filters == {"labels": ["Foreign"]}


async def test_demo_reset_rebuilds_vocabulary_without_accumulation(db_session):
    from app.demo.reset import _run_reset

    await _run_reset(db_session)
    names = list(await db_session.scalars(select(Label.name)))
    first_links = await db_session.scalar(
        select(func.count()).select_from(TransactionLabel)
    )
    assert names and first_links
    await _run_reset(db_session)
    assert sorted(await db_session.scalars(select(Label.name))) == sorted(names)
    assert (
        await db_session.scalar(select(func.count()).select_from(TransactionLabel))
        == first_links
    )


async def test_legacy_restore_normalizes_only_recognized_report_names(client):
    payload = {
        "transactions": [transaction(labels=[" Flight "])],
        "reports": [
            {
                "id": "whitespace-report",
                "name": "Legacy",
                "filters": {
                    "labels": [" Flight ", "Flight", "", "Unused"],
                    "categories": [" Flight "],
                    "future": {"labels": [" Flight "]},
                },
            }
        ],
    }
    assert (await restore(client, payload)).status_code == 200
    report = (await client.get("/api/reports")).json()[0]
    assert report["filters"] == {
        "labels": ["Flight", "Unused"],
        "categories": [" Flight "],
        "future": {"labels": [" Flight "]},
    }
    assert (await client.get("/api/expenses")).json()[0]["labels"] == ["Flight"]


@pytest.mark.parametrize("labels", [[7], ["x" * 256]])
async def test_invalid_report_names_rejected_before_restore_inserts(
    client, db_session, labels
):
    payload = {
        "transactions": [transaction()],
        "labels": [{"name": "Unused"}],
        "reports": [{"id": "invalid", "filters": {"labels": labels}}],
    }
    assert (await restore(client, payload)).status_code == 422
    assert await db_session.scalar(select(func.count()).select_from(Label)) == 0


async def test_saved_reference_writes_normalize_and_validate_labels(client):
    response = await client.post(
        "/api/reports",
        json={
            "report": {
                "id": "save-labels",
                "name": "Saved",
                "filters": {"labels": [" Flight ", "Flight", ""]},
            }
        },
    )
    assert response.status_code == 200
    assert (await client.get("/api/reports")).json()[0]["filters"]["labels"] == [
        "Flight"
    ]
    bad_report = await client.post(
        "/api/reports",
        json={
            "report": {
                "id": "save-labels",
                "name": "Bad",
                "filters": {"labels": [7]},
            }
        },
    )
    assert bad_report.status_code == 422
    assert (await client.get("/api/reports")).json()[0]["name"] == "Saved"
    dashboard = await client.post(
        "/api/dashboards",
        json={
            "id": "filter-validation",
            "name": "Synthetic",
            "dateRangeStart": "2024-01-01",
            "dateRangeEnd": "2024-01-31",
        },
    )
    assert dashboard.status_code == 201
    panel = await client.post(
        "/api/dashboards/filter-validation/panels",
        json={
            "id": "filter-panel",
            "title": "Synthetic",
            "chartType": "bar",
            "filterGroups": [
                {
                    "conditions": [
                        {
                            "field": "labels",
                            "operator": "includes",
                            "value": [" Hotel ", "Hotel"],
                        }
                    ]
                }
            ],
        },
    )
    assert panel.status_code == 201
    assert panel.json()["filterGroups"][0]["conditions"][0]["value"] == ["Hotel"]
    bad_panel = await client.patch(
        "/api/dashboard-panels/filter-panel",
        json={
            "filterGroups": [
                {
                    "conditions": [
                        {"field": "labels", "operator": "includes", "value": [None]}
                    ]
                }
            ],
        },
    )
    assert bad_panel.status_code == 422
