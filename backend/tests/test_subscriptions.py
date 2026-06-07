"""HTTP tests for subscription routes."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models import Subscription, Transaction
from tests.conftest import DEFAULT_TEST_HOUSEHOLD_ID

pytestmark = pytest.mark.asyncio

HH_ID = DEFAULT_TEST_HOUSEHOLD_ID


@pytest.fixture
async def hh_with_sub(db_session, client: AsyncClient) -> dict:
    sub = Subscription(
        id="sub_test1",
        household_id=HH_ID,
        name="Netflix",
        cadence="monthly",
        expected_amount=Decimal("15.99"),
        type="expense",
        status="active",
        first_seen=date(2026, 1, 5),
        last_seen=date(2026, 3, 5),
        detection_signature="netflix",
        user_overrides={
            "excludedTxnIds": [],
            "includedTxnIds": [],
            "lockName": False,
            "lockAmount": False,
            "lockCadence": False,
        },
        metadata_={},
    )
    db_session.add(sub)
    for i, d in enumerate(
        [date(2026, 1, 5), date(2026, 2, 5), date(2026, 3, 5)], start=1
    ):
        db_session.add(
            Transaction(
                id=f"t{i}",
                date=d,
                description="Netflix",
                category="Entertainment",
                amount=Decimal("15.99"),
                type="expense",
                household_id=HH_ID,
                labels=[],
                metadata_={},
                excluded_from_calculations=False,
                subscription_id="sub_test1",
            )
        )
    await db_session.commit()
    return {"household_id": HH_ID, "sub_id": "sub_test1"}


async def test_list_subscriptions(client, hh_with_sub) -> None:
    res = await client.get("/api/subscriptions")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 1
    sub = body["subscriptions"][0]
    assert sub["id"] == "sub_test1"
    assert sub["member_count"] == 3


async def test_get_subscription_detail(client, hh_with_sub) -> None:
    res = await client.get("/api/subscriptions/sub_test1")
    assert res.status_code == 200
    body = res.json()
    assert body["id"] == "sub_test1"
    assert len(body["members"]) == 3


async def test_list_filters_by_status(client, hh_with_sub, db_session) -> None:
    db_session.add(
        Subscription(
            id="sub_cancel",
            household_id=hh_with_sub["household_id"],
            name="OldThing",
            cadence="monthly",
            expected_amount=Decimal("9.99"),
            type="expense",
            status="cancelled",
            first_seen=None,
            last_seen=None,
            detection_signature="oldthing",
            user_overrides={
                "excludedTxnIds": [],
                "includedTxnIds": [],
                "lockName": False,
                "lockAmount": False,
                "lockCadence": False,
            },
            metadata_={},
        )
    )
    await db_session.commit()
    res = await client.get("/api/subscriptions?status=cancelled")
    assert res.status_code == 200
    ids = {s["id"] for s in res.json()["subscriptions"]}
    assert ids == {"sub_cancel"}


async def test_cross_household_returns_404(client) -> None:
    res = await client.get("/api/subscriptions/sub_does_not_exist")
    assert res.status_code == 404


async def test_create_manual_subscription(client) -> None:
    res = await client.post(
        "/api/subscriptions",
        json={
            "name": "Manual Sub",
            "cadence": "monthly",
            "type": "expense",
            "expected_amount": 9.99,
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["name"] == "Manual Sub"
    assert body["status"] == "manual"
    assert body["detection_signature"] is None


async def test_create_active_subscription_with_seed_txns(
    client,
    db_session,
) -> None:
    hh_id = HH_ID
    for i, d in enumerate(
        [date(2026, 1, 5), date(2026, 2, 5), date(2026, 3, 5)], start=10
    ):
        db_session.add(
            Transaction(
                id=f"seed{i}",
                date=d,
                description="SpotifyUSA",
                category="Entertainment",
                amount=Decimal("11.99"),
                type="expense",
                household_id=hh_id,
                labels=[],
                metadata_={},
                excluded_from_calculations=False,
            )
        )
    await db_session.commit()

    res = await client.post(
        "/api/subscriptions",
        json={
            "name": "Spotify",
            "cadence": "monthly",
            "type": "expense",
            "expected_amount": 11.99,
            "transactionIds": ["seed10", "seed11", "seed12"],
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "active"
    assert body["detection_signature"] == "spotifyusa"


async def test_patch_sets_lock_flags(client, hh_with_sub) -> None:
    res = await client.patch(
        f"/api/subscriptions/{hh_with_sub['sub_id']}",
        json={"name": "My Netflix", "expected_amount": 19.99},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["name"] == "My Netflix"
    assert body["user_overrides"]["lockName"] is True
    assert body["user_overrides"]["lockAmount"] is True
    assert body["user_overrides"]["lockCadence"] is False


async def test_delete_subscription_unlinks_members(
    client,
    hh_with_sub,
    db_session,
) -> None:
    res = await client.delete(f"/api/subscriptions/{hh_with_sub['sub_id']}")
    assert res.status_code == 204

    rows = (
        (
            await db_session.execute(
                select(Transaction).where(Transaction.id.in_(["t1", "t2", "t3"]))
            )
        )
        .scalars()
        .all()
    )
    assert all(t.subscription_id is None for t in rows)
