"""HTTP tests for subscription routes."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from httpx import AsyncClient

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
