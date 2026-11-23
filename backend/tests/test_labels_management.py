from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.models import (
    Dashboard,
    DashboardPanel,
    Household,
    Label,
    Report,
    Transaction,
    TransactionLabel,
)
from app.utils.labels import (
    ensure_labels,
    load_transaction_label_names,
    merge_labels,
    replace_transaction_labels,
)

HH = "household-default"


@pytest.fixture
async def catalog_data(client, db_session):
    db_session.add(Household(id="label-management-foreign", name="Foreign"))
    await db_session.flush()
    rows = [
        Transaction(
            id=f"label-management-{index}",
            household_id=HH,
            date=date(2024, 1, index + 1),
            description="Synthetic",
            category="Travel",
            amount=Decimal("10.10"),
            type="expense",
        )
        for index in range(2)
    ]
    db_session.add_all(rows)
    await db_session.flush()
    target = (await ensure_labels(db_session, HH, ["Target"], created_by="ai"))[
        "Target"
    ]
    await replace_transaction_labels(
        db_session,
        HH,
        {
            rows[0].id: ["Source", "Target"],
            rows[1].id: ["Source"],
        },
    )
    source = (await ensure_labels(db_session, HH, ["Source"]))["Source"]
    unused = (await ensure_labels(db_session, HH, ["Unused"]))["Unused"]
    foreign = (await ensure_labels(db_session, "label-management-foreign", ["Source"]))[
        "Source"
    ]
    filters = {
        "labels": ["Source", "Target", "Source"],
        "categories": ["Source"],
        "future": {"labels": ["Source"]},
    }
    report = Report(
        id="label-management-report", name="Synthetic", household_id=HH, filters=filters
    )
    foreign_report = Report(
        id="label-management-foreign-report",
        name="Synthetic",
        household_id="label-management-foreign",
        filters=filters,
    )
    dashboard = Dashboard(
        id="label-management-dashboard",
        name="Synthetic",
        household_id=HH,
        date_range_start=date(2024, 1, 1),
        date_range_end=date(2024, 1, 31),
    )
    db_session.add_all([report, foreign_report, dashboard])
    await db_session.flush()
    panel = DashboardPanel(
        id="label-management-panel",
        dashboard_id=dashboard.id,
        title="Synthetic",
        chart_type="bar",
        filter_groups=[
            {
                "conditions": [
                    {
                        "field": "labels",
                        "operator": "excludes",
                        "value": ["Source", "Target"],
                    },
                    {"field": "category", "operator": "is", "value": ["Source"]},
                ],
                "future": {"labels": ["Source"]},
            }
        ],
    )
    db_session.add(panel)
    await db_session.flush()
    return {
        "source": source,
        "target": target,
        "unused": unused,
        "foreign": foreign,
        "rows": rows,
        "report": report,
        "foreign_report": foreign_report,
        "panel": panel,
    }


async def test_catalog_includes_unused_definitions_and_scoped_counts(
    catalog_data, client
):
    response = await client.get("/api/labels")
    assert response.json() == {"labels": ["Source", "Target", "Unused"]}
    response = await client.get("/api/labels/catalog")
    assert response.status_code == 200
    labels = response.json()["labels"]
    assert [
        (item["name"], item["usageCount"], item["createdBy"]) for item in labels
    ] == [
        ("Source", 2, "user"),
        ("Target", 1, "ai"),
        ("Unused", 0, "user"),
    ]
    assert all(item["createdAt"] for item in labels)


async def test_rename_keeps_id_origin_and_updates_only_recognized_scoped_refs(
    catalog_data, client, db_session
):
    data = catalog_data
    source = data["source"]
    response = await client.patch(
        f"/api/labels/{source.id}", json={"name": " Lodging\t"}
    )
    assert response.status_code == 200
    assert response.json()["id"] == source.id
    assert response.json()["name"] == "Lodging"
    assert response.json()["createdBy"] == "user"
    assert response.json()["usageCount"] == 2
    assert await load_transaction_label_names(db_session, data["rows"]) == {
        data["rows"][0].id: ["Lodging", "Target"],
        data["rows"][1].id: ["Lodging"],
    }
    assert data["report"].filters == {
        "labels": ["Lodging", "Target"],
        "categories": ["Source"],
        "future": {"labels": ["Source"]},
    }
    assert data["foreign_report"].filters["labels"] == ["Source", "Target", "Source"]
    assert data["panel"].filter_groups == [
        {
            "conditions": [
                {
                    "field": "labels",
                    "operator": "excludes",
                    "value": ["Lodging", "Target"],
                },
                {"field": "category", "operator": "is", "value": ["Source"]},
            ],
            "future": {"labels": ["Source"]},
        }
    ]
    again = await client.patch(f"/api/labels/{source.id}", json={"name": "Lodging"})
    assert again.status_code == 200
    assert again.json() == response.json()


async def test_merge_moves_deduplicates_links_references_and_preserves_target(
    catalog_data, client, db_session
):
    data = catalog_data
    source_id, target_id = data["source"].id, data["target"].id
    response = await client.post(
        f"/api/labels/{source_id}/merge", json={"targetId": target_id}
    )
    assert response.status_code == 200
    assert response.json()["id"] == target_id
    assert response.json()["mergedLabelId"] == source_id
    assert response.json()["createdBy"] == "ai"
    assert response.json()["usageCount"] == 2
    assert await db_session.get(Label, source_id) is None
    assert (
        await db_session.scalar(select(func.count()).select_from(TransactionLabel)) == 2
    )
    assert await load_transaction_label_names(db_session, data["rows"]) == {
        row.id: ["Target"] for row in data["rows"]
    }
    assert data["report"].filters["labels"] == ["Target"]
    assert data["report"].filters["future"] == {"labels": ["Source"]}
    assert data["foreign_report"].filters["labels"] == ["Source", "Target", "Source"]
    repeated = await client.post(
        f"/api/labels/{source_id}/merge", json={"targetId": target_id}
    )
    assert repeated.status_code == 404
    assert (await db_session.get(Label, target_id)).created_by == "ai"


async def test_management_status_contracts(catalog_data, client):
    data = catalog_data
    source_id = data["source"].id
    assert (
        await client.patch(f"/api/labels/{source_id}", json={"name": "Target"})
    ).status_code == 409
    for invalid in (" \t\n", None, 1, [], "x" * 256, "😀" * 256):
        assert (
            await client.patch(f"/api/labels/{source_id}", json={"name": invalid})
        ).status_code == 422
    assert (
        await client.post(
            f"/api/labels/{source_id}/merge", json={"targetId": source_id}
        )
    ).status_code == 422
    for missing in ("missing", data["foreign"].id):
        assert (
            await client.patch(f"/api/labels/{missing}", json={"name": "Other"})
        ).status_code == 404
        assert (
            await client.post(
                f"/api/labels/{source_id}/merge", json={"targetId": missing}
            )
        ).status_code == 404
        assert (
            await client.post(
                f"/api/labels/{missing}/merge", json={"targetId": data["target"].id}
            )
        ).status_code == 404


async def test_unused_definition_can_rename_and_merge(catalog_data, client):
    data = catalog_data
    unused_id = data["unused"].id
    renamed = await client.patch(
        f"/api/labels/{unused_id}", json={"name": "Unattached"}
    )
    assert renamed.status_code == 200
    assert renamed.json()["usageCount"] == 0
    merged = await client.post(
        f"/api/labels/{unused_id}/merge", json={"targetId": data["target"].id}
    )
    assert merged.status_code == 200
    assert merged.json()["usageCount"] == 1


async def test_rename_length_limit_counts_unicode_after_trimming(catalog_data, client):
    label_id = catalog_data["unused"].id
    accepted = await client.patch(
        f"/api/labels/{label_id}", json={"name": " \t" + "😀" * 255 + "\n"}
    )
    assert accepted.status_code == 200
    assert accepted.json()["name"] == "😀" * 255
    rejected = await client.patch(f"/api/labels/{label_id}", json={"name": "😀" * 256})
    assert rejected.status_code == 422
    catalog = (await client.get("/api/labels/catalog")).json()["labels"]
    assert (
        next(item for item in catalog if item["id"] == label_id)["name"] == "😀" * 255
    )


async def test_management_failure_rolls_back_references_links_and_source(
    catalog_data, db_session, monkeypatch
):
    data = catalog_data
    old_flush = db_session.flush
    source_id = data["source"].id
    async with db_session.begin_nested() as savepoint:

        async def fail_flush(*args, **kwargs):
            raise RuntimeError("after staged merge")

        monkeypatch.setattr(db_session, "flush", fail_flush)
        with pytest.raises(RuntimeError, match="after staged merge"):
            await merge_labels(db_session, HH, source_id, data["target"].id)
        monkeypatch.setattr(db_session, "flush", old_flush)
        await savepoint.rollback()
    await db_session.refresh(data["source"])
    await db_session.refresh(data["report"])
    assert data["source"].name == "Source"
    assert data["report"].filters["labels"] == ["Source", "Target", "Source"]
    rows = (
        await db_session.scalars(
            select(Transaction).where(Transaction.household_id == HH)
        )
    ).all()
    assert await load_transaction_label_names(db_session, rows) == {
        "label-management-0": ["Source", "Target"],
        "label-management-1": ["Source"],
    }
