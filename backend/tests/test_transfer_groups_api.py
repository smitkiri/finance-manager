"""HTTP tests for transfer groups and the write paths that must keep them current."""

from datetime import date
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.import_session import ImportSession
from app.models.transaction import Transaction
from app.models.transfer_group import TransferGroup

HH = "household-default"


def _txn(tid, amount, typ, d, user="alice", **kw):
    return Transaction(
        id=tid,
        date=d,
        description=tid,
        category="Transfers",
        amount=Decimal(amount),
        type=typ,
        household_id=kw.pop("household_id", HH),
        created_by_user_id=user,
        labels=[],
        metadata_={},
        **kw,
    )


async def _seed(db: AsyncSession, anchor_amount: str = "5000.00", **member_kw):
    db.add(_txn("pay", anchor_amount, "income", date(2024, 1, 1)))
    for i in range(5):
        db.add(_txn(f"v{i}", "900.00", "expense", date(2024, 1, 2 + i), **member_kw))
    db.add(_txn("coffee", "4.50", "expense", date(2024, 1, 9)))
    await db.flush()


async def _create(client: AsyncClient, anchor="pay", members=None):
    members = members if members is not None else [f"v{i}" for i in range(5)]
    return await client.post(
        "/api/transfer-groups", json={"anchorId": anchor, "memberIds": members}
    )


def _by_id(group_json) -> dict:
    return {t["id"]: t for t in group_json["transactions"]}


async def _effective(db: AsyncSession, tid: str):
    row = (
        await db.execute(
            select(
                Transaction.transfer_group_id,
                Transaction.transfer_role,
                Transaction.effective_amount,
            ).where(Transaction.id == tid)
        )
    ).one()
    return row


# --- CRUD -------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_group(client: AsyncClient, db_session):
    await _seed(db_session)
    response = await _create(client)
    assert response.status_code == 201
    data = response.json()
    assert data["kind"] == "self"
    assert data["source"] == "manual"
    assert data["includeInCalculations"] is False
    ids = [t["id"] for t in data["transactions"]]
    assert ids == ["pay", "v0", "v1", "v2", "v3", "v4"]
    rows = _by_id(data)
    assert rows["pay"]["effectiveAmount"] == pytest.approx(500.0)
    assert rows["pay"]["transferGroup"]["role"] == "anchor"
    assert rows["v0"]["effectiveAmount"] == pytest.approx(0.0)
    assert rows["v0"]["transferGroup"]["role"] == "member"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "anchor,members",
    [("pay", []), ("pay", ["pay"]), ("pay", ["nope"]), ("v0", ["v1"])],
)
async def test_create_group_validation_errors(
    client: AsyncClient, db_session, anchor, members
):
    await _seed(db_session)
    response = await _create(client, anchor, members)
    assert response.status_code == 400
    assert response.json()["error"]


@pytest.mark.asyncio
async def test_get_group(client: AsyncClient, db_session):
    await _seed(db_session)
    group_id = (await _create(client)).json()["id"]
    response = await client.get(f"/api/transfer-groups/{group_id}")
    assert response.status_code == 200
    assert len(response.json()["transactions"]) == 6


@pytest.mark.asyncio
async def test_other_household_group_is_404(client: AsyncClient, db_session):
    await db_session.execute(
        text("INSERT INTO households (id, name) VALUES ('hh-x', 'X')")
    )
    db_session.add(
        TransferGroup(id="tg_x", household_id="hh-x", kind="self", source="manual")
    )
    await db_session.flush()
    assert (await client.get("/api/transfer-groups/tg_x")).status_code == 404
    patch = await client.patch(
        "/api/transfer-groups/tg_x", json={"includeInCalculations": True}
    )
    assert patch.status_code == 404
    assert (await client.delete("/api/transfer-groups/tg_x")).status_code == 404


@pytest.mark.asyncio
async def test_patch_members_and_include(client: AsyncClient, db_session):
    await _seed(db_session)
    group_id = (await _create(client)).json()["id"]

    response = await client.patch(
        f"/api/transfer-groups/{group_id}", json={"memberIds": ["v0", "v1"]}
    )
    assert response.status_code == 200
    assert _by_id(response.json())["pay"]["effectiveAmount"] == pytest.approx(3200.0)
    assert (await _effective(db_session, "v4")).transfer_group_id is None

    response = await client.patch(
        f"/api/transfer-groups/{group_id}", json={"includeInCalculations": True}
    )
    assert response.json()["includeInCalculations"] is True
    assert _by_id(response.json())["pay"]["effectiveAmount"] is None


@pytest.mark.asyncio
async def test_patch_members_validation_error(client: AsyncClient, db_session):
    await _seed(db_session)
    group_id = (await _create(client)).json()["id"]
    response = await client.patch(
        f"/api/transfer-groups/{group_id}", json={"memberIds": []}
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_delete_group_unlinks(client: AsyncClient, db_session):
    await _seed(db_session)
    group_id = (await _create(client)).json()["id"]
    response = await client.delete(f"/api/transfer-groups/{group_id}")
    assert response.status_code == 200
    assert await db_session.get(TransferGroup, group_id) is None
    assert tuple(await _effective(db_session, "pay")) == (None, None, None)


@pytest.mark.asyncio
async def test_recompute_endpoint_repairs_stale_amounts(
    client: AsyncClient, db_session
):
    await _seed(db_session)
    await _create(client)
    await db_session.execute(
        text("UPDATE transactions SET effective_amount = 123 WHERE id = 'pay'")
    )
    response = await client.post("/api/transfer-groups/recompute")
    assert response.json() == {"success": True, "groups": 1}
    assert (await _effective(db_session, "pay")).effective_amount == Decimal("500.00")


# --- Serialization ----------------------------------------------------------


@pytest.mark.asyncio
async def test_list_expenses_includes_group_fields(client: AsyncClient, db_session):
    await _seed(db_session, anchor_amount="4000.00")
    group_id = (await _create(client)).json()["id"]
    rows = {t["id"]: t for t in (await client.get("/api/expenses")).json()}
    assert rows["v0"]["effectiveAmount"] == pytest.approx(500.0)
    assert rows["v0"]["transferGroup"] == {
        "id": group_id,
        "role": "member",
        "kind": "self",
        "includeInCalculations": False,
    }
    assert rows["coffee"]["effectiveAmount"] is None
    assert rows["coffee"]["transferGroup"] is None


# --- Write paths keep groups current ----------------------------------------


@pytest.mark.asyncio
async def test_editing_member_amount_moves_remainder_to_anchor(
    client: AsyncClient, db_session
):
    # 4000 vs 5x900: v0 keeps 500. Shrinking v0 to 100 makes members total
    # 3700 < 4000, so the anchor now keeps 300 and every member is 0.
    await _seed(db_session, anchor_amount="4000.00")
    await _create(client)
    response = await client.patch("/api/expenses/v0", json={"amount": 100})
    assert response.status_code == 200
    assert response.json()["effectiveAmount"] == pytest.approx(0.0)
    assert (await _effective(db_session, "pay")).effective_amount == Decimal("300.00")


@pytest.mark.asyncio
async def test_editing_member_date_reorders_allocation(client: AsyncClient, db_session):
    await _seed(db_session, anchor_amount="4000.00")
    await _create(client)
    await client.patch("/api/expenses/v4", json={"date": "2023-12-31"})
    assert (await _effective(db_session, "v4")).effective_amount == Decimal("500.00")
    assert (await _effective(db_session, "v0")).effective_amount == Decimal("0.00")


@pytest.mark.asyncio
async def test_changing_type_detaches_and_dissolves_empty_group(
    client: AsyncClient, db_session
):
    await _seed(db_session)
    group_id = (await _create(client, members=["v0"])).json()["id"]
    response = await client.patch("/api/expenses/v0", json={"type": "income"})
    assert response.status_code == 200
    assert response.json()["transferGroup"] is None
    assert await db_session.get(TransferGroup, group_id) is None
    assert tuple(await _effective(db_session, "pay")) == (None, None, None)


@pytest.mark.asyncio
async def test_patch_ignores_transfer_info(client: AsyncClient, db_session):
    await _seed(db_session)
    response = await client.patch(
        "/api/expenses/coffee",
        json={"category": "Food", "transferInfo": {"isTransfer": True}},
    )
    assert response.status_code == 200
    assert "transferInfo" not in response.json()


def _bulk_payload(rows: list[dict]) -> dict:
    keep = (
        "id",
        "date",
        "description",
        "category",
        "amount",
        "type",
        "user",
        "labels",
        "metadata",
    )
    return {"expenses": [{k: r[k] for k in keep} for r in rows]}


@pytest.mark.asyncio
async def test_bulk_replace_keeps_groups(client: AsyncClient, db_session):
    await _seed(db_session, anchor_amount="4000.00")
    group_id = (await _create(client)).json()["id"]
    rows = (await client.get("/api/expenses")).json()

    # The frontend's "delete one transaction" is a bulk replace without it.
    payload = _bulk_payload([r for r in rows if r["id"] != "coffee"])
    assert (await client.post("/api/expenses", json=payload)).status_code == 200

    after = {t["id"]: t for t in (await client.get("/api/expenses")).json()}
    assert "coffee" not in after
    assert after["pay"]["transferGroup"]["id"] == group_id
    assert after["pay"]["transferGroup"]["role"] == "anchor"
    assert after["v0"]["effectiveAmount"] == pytest.approx(500.0)
    assert after["v1"]["effectiveAmount"] == pytest.approx(0.0)


@pytest.mark.asyncio
async def test_bulk_replace_without_anchor_dissolves_group(
    client: AsyncClient, db_session
):
    await _seed(db_session)
    group_id = (await _create(client)).json()["id"]
    rows = (await client.get("/api/expenses")).json()
    payload = _bulk_payload([r for r in rows if r["id"] != "pay"])
    assert (await client.post("/api/expenses", json=payload)).status_code == 200

    after = {t["id"]: t for t in (await client.get("/api/expenses")).json()}
    assert after["v0"]["transferGroup"] is None
    assert after["v0"]["effectiveAmount"] is None
    assert await db_session.get(TransferGroup, group_id) is None


@pytest.mark.asyncio
async def test_bulk_replace_without_member_reallocates(client: AsyncClient, db_session):
    await _seed(db_session)
    await _create(client)
    rows = (await client.get("/api/expenses")).json()
    payload = _bulk_payload([r for r in rows if r["id"] != "v4"])
    await client.post("/api/expenses", json=payload)
    after = {t["id"]: t for t in (await client.get("/api/expenses")).json()}
    assert after["pay"]["effectiveAmount"] == pytest.approx(1400.0)


@pytest.mark.asyncio
async def test_undo_import_reallocates_group(client: AsyncClient, db_session):
    db_session.add(
        ImportSession(
            id="imp1", household_id=HH, source_name="csv", transaction_count=1
        )
    )
    await db_session.flush()
    await _seed(db_session, import_id="imp1")
    assert (await _create(client, members=["v0", "v1"])).status_code == 201

    response = await client.delete("/api/import-sessions/imp1")
    assert response.status_code == 200
    # Every member came from the import, so the group dissolves.
    assert tuple(await _effective(db_session, "pay")) == (None, None, None)


@pytest.mark.asyncio
async def test_undo_import_via_data_route(client: AsyncClient, db_session):
    db_session.add(
        ImportSession(
            id="imp2", household_id=HH, source_name="csv", transaction_count=1
        )
    )
    await db_session.flush()
    await _seed(db_session)
    v4 = await db_session.get(Transaction, "v4")
    assert v4 is not None
    v4.import_id = "imp2"
    await db_session.flush()
    await _create(client)

    response = await client.post("/api/undo-import", json={"sessionId": "imp2"})
    assert response.status_code == 200
    assert (await _effective(db_session, "pay")).effective_amount == Decimal("1400.00")


@pytest.mark.asyncio
async def test_delete_all_removes_groups(client: AsyncClient, db_session):
    await _seed(db_session)
    assert (await _create(client)).status_code == 201
    assert (await client.delete("/api/delete-all")).status_code == 200
    groups = (await db_session.execute(select(TransferGroup))).scalars().all()
    assert groups == []


@pytest.mark.asyncio
async def test_delete_selected_transactions_removes_groups(
    client: AsyncClient, db_session
):
    await _seed(db_session)
    assert (await _create(client)).status_code == 201
    response = await client.post(
        "/api/delete-selected", json={"deleteTransactions": True}
    )
    assert response.status_code == 200
    groups = (await db_session.execute(select(TransferGroup))).scalars().all()
    assert groups == []
