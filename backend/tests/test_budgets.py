from datetime import date
from decimal import Decimal

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Budget, Category, Transaction
from app.utils.transfer_groups import create_group
from tests.conftest import auth_headers

HH = "household-default"


def _budget(category: str, month: date, amount: str | None, hh: str = HH) -> Budget:
    return Budget(
        id=f"b-{hh}-{category}-{month.isoformat()}",
        household_id=hh,
        category=category,
        effective_month=month,
        amount=Decimal(amount) if amount is not None else None,
    )


def _txn(
    tid: str,
    amount: str,
    d: date,
    category: str = "Dining",
    typ: str = "expense",
    hh: str = HH,
    user: str = "alice",
    **kw,
) -> Transaction:
    return Transaction(
        id=tid,
        date=d,
        description=tid,
        category=category,
        amount=Decimal(amount),
        type=typ,
        household_id=hh,
        created_by_user_id=user,
        labels=[],
        metadata_={},
        **kw,
    )


async def _get(client: AsyncClient, month: str, **params) -> dict:
    response = await client.get("/api/budgets", params={"month": month, **params})
    assert response.status_code == 200, response.text
    return response.json()


def _row(data: dict, category: str) -> dict:
    [row] = [r for r in data["categories"] if r["category"] == category]
    return row


@pytest.mark.asyncio
async def test_get_empty(client: AsyncClient):
    assert await _get(client, "2026-10") == {
        "month": "2026-10",
        "earliestMonth": None,
        "hasData": False,
        "categories": [],
    }


@pytest.mark.asyncio
async def test_limit_resolution_is_forward_only(
    client: AsyncClient, db_session: AsyncSession
):
    db_session.add_all(
        [
            _budget("Dining", date(2026, 8, 1), "300"),
            _budget("Dining", date(2026, 10, 1), "250"),
        ]
    )
    await db_session.flush()

    assert _row(await _get(client, "2026-09"), "Dining")["limit"] == 300
    october = await _get(client, "2026-10")
    dining = _row(october, "Dining")
    assert dining["limit"] == 250
    assert october["earliestMonth"] == "2026-08"
    assert [h["month"] for h in dining["history"]] == [
        "2026-05",
        "2026-06",
        "2026-07",
        "2026-08",
        "2026-09",
        "2026-10",
    ]
    assert [h["limit"] for h in dining["history"]] == [None, None, None, 300, 300, 250]
    assert (await _get(client, "2026-07"))["categories"] == []


@pytest.mark.asyncio
async def test_removed_limit_hides_category(
    client: AsyncClient, db_session: AsyncSession
):
    db_session.add_all(
        [
            _budget("Dining", date(2026, 8, 1), "300"),
            _budget("Dining", date(2026, 10, 1), None),
        ]
    )
    await db_session.flush()

    assert (await _get(client, "2026-10"))["categories"] == []
    assert _row(await _get(client, "2026-09"), "Dining")["limit"] == 300


@pytest.mark.asyncio
async def test_actual_matches_stats(client: AsyncClient, db_session: AsyncSession):
    db_session.add_all(
        [
            _budget("Dining", date(2026, 10, 1), "300"),
            _txn("normal", "100.00", date(2026, 10, 3)),
            _txn(
                "excluded",
                "50.00",
                date(2026, 10, 4),
                excluded_from_calculations=True,
            ),
            _txn("offset", "80.00", date(2026, 10, 5)),
            _txn(
                "refund", "60.00", date(2026, 10, 6), category="Refunds", typ="income"
            ),
        ]
    )
    await db_session.flush()
    await create_group(db_session, HH, "refund", ["offset"])

    actual = _row(await _get(client, "2026-10"), "Dining")["actual"]
    assert actual == pytest.approx(120.0)
    stats = (
        await client.get(
            "/api/stats", params={"dateFrom": "2026-10-01", "dateTo": "2026-10-31"}
        )
    ).json()
    assert actual == pytest.approx(stats["categoryBreakdown"]["Dining"])


@pytest.mark.asyncio
async def test_income_rows_do_not_reduce_actual(
    client: AsyncClient, db_session: AsyncSession
):
    db_session.add_all(
        [
            _budget("Dining", date(2026, 10, 1), "300"),
            _txn("meal", "100.00", date(2026, 10, 3)),
            _txn("back", "40.00", date(2026, 10, 4), typ="income"),
        ]
    )
    await db_session.flush()

    assert _row(await _get(client, "2026-10"), "Dining")["actual"] == pytest.approx(
        100.0
    )


@pytest.mark.asyncio
async def test_actual_counts_all_household_members(
    raw_client: AsyncClient, db_session: AsyncSession, two_member_household
):
    user_a, user_b, household, token_a = two_member_household
    db_session.add_all(
        [
            _budget("Dining", date(2026, 10, 1), "300", hh=household.id),
            _txn("a", "60.00", date(2026, 10, 3), hh=household.id, user=user_a.id),
            _txn("b", "40.00", date(2026, 10, 4), hh=household.id, user=user_b.id),
        ]
    )
    await db_session.flush()

    response = await raw_client.get(
        "/api/budgets", params={"month": "2026-10"}, headers=auth_headers(token_a)
    )
    assert _row(response.json(), "Dining")["actual"] == pytest.approx(100.0)


@pytest.mark.asyncio
async def test_month_boundaries(client: AsyncClient, db_session: AsyncSession):
    db_session.add_all(
        [
            _budget("Dining", date(2026, 9, 1), "300"),
            _txn("sep30", "10.00", date(2026, 9, 30)),
            _txn("oct1", "20.00", date(2026, 10, 1)),
            _txn("oct31", "30.00", date(2026, 10, 31)),
            _txn("nov1", "40.00", date(2026, 11, 1)),
        ]
    )
    await db_session.flush()

    dining = _row(await _get(client, "2026-10"), "Dining")
    assert dining["actual"] == pytest.approx(50.0)
    assert dining["history"][-2]["month"] == "2026-09"
    assert dining["history"][-2]["actual"] == pytest.approx(10.0)


@pytest.mark.asyncio
async def test_has_data_flags(client: AsyncClient, db_session: AsyncSession):
    db_session.add_all(
        [
            _budget("Dining", date(2026, 1, 1), "300"),
            _txn("groceries", "25.00", date(2026, 10, 9), category="Groceries"),
        ]
    )
    await db_session.flush()

    october = await _get(client, "2026-10")
    assert october["hasData"] is True
    assert [h["hasData"] for h in _row(october, "Dining")["history"]] == [False] * 5 + [
        True
    ]


@pytest.mark.asyncio
async def test_in_category_list_false_for_renamed(
    client: AsyncClient, db_session: AsyncSession
):
    db_session.add_all(
        [
            Category(id="Dining", name="Dining", household_id=HH),
            _budget("Dining", date(2026, 10, 1), "300"),
            _budget("Dining Out", date(2026, 10, 1), "100"),
        ]
    )
    await db_session.flush()

    october = await _get(client, "2026-10")
    assert _row(october, "Dining")["inCategoryList"] is True
    assert _row(october, "Dining Out")["inCategoryList"] is False


@pytest.mark.asyncio
async def test_household_isolation(
    raw_client: AsyncClient, db_session: AsyncSession, two_households_two_users
):
    _, _, _, h2, token_a = two_households_two_users
    db_session.add(_budget("Dining", date(2026, 10, 1), "300", hh=h2.id))
    await db_session.flush()

    response = await raw_client.get(
        "/api/budgets", params={"month": "2026-10"}, headers=auth_headers(token_a)
    )
    assert response.json()["categories"] == []
    assert response.json()["earliestMonth"] is None


@pytest.mark.asyncio
@pytest.mark.parametrize("month", ["2026-13", "oct"])
async def test_bad_month_422(client: AsyncClient, month: str):
    response = await client.get("/api/budgets", params={"month": month})
    assert response.status_code == 422


async def _put(client: AsyncClient, category: str, month: str, amount) -> Response:
    return await client.put(
        "/api/budgets", json={"category": category, "month": month, "amount": amount}
    )


@pytest.mark.asyncio
async def test_put_creates_then_get_reflects(client: AsyncClient):
    response = await _put(client, "Groceries", "2026-10", 300)
    assert response.status_code == 200
    assert response.json() == {
        "category": "Groceries",
        "month": "2026-10",
        "amount": 300,
    }
    assert _row(await _get(client, "2026-10"), "Groceries")["limit"] == 300


@pytest.mark.asyncio
async def test_put_same_month_replaces(client: AsyncClient, db_session: AsyncSession):
    await _put(client, "Groceries", "2026-10", 300)
    await _put(client, "Groceries", "2026-10", 250)

    rows = (
        (await db_session.execute(select(Budget).where(Budget.household_id == HH)))
        .scalars()
        .all()
    )
    assert len(rows) == 1
    assert _row(await _get(client, "2026-10"), "Groceries")["limit"] == 250


@pytest.mark.asyncio
async def test_put_null_removes_forward(client: AsyncClient):
    await _put(client, "Groceries", "2026-09", 300)
    response = await _put(client, "Groceries", "2026-10", None)
    assert response.status_code == 200

    assert (await _get(client, "2026-10"))["categories"] == []
    assert _row(await _get(client, "2026-09"), "Groceries")["limit"] == 300


@pytest.mark.asyncio
async def test_put_unknown_category_400(client: AsyncClient):
    response = await _put(client, "Nope", "2026-10", 300)
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_put_default_category_ok(client: AsyncClient):
    response = await _put(client, "Shopping", "2026-10", 200)
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_put_renamed_category_edit_allowed(
    client: AsyncClient, db_session: AsyncSession
):
    db_session.add(_budget("Dining Out", date(2026, 9, 1), "100"))
    await db_session.flush()

    response = await _put(client, "Dining Out", "2026-10", 200)
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_put_remove_without_versions_400(client: AsyncClient):
    response = await _put(client, "Groceries", "2026-10", None)
    assert response.status_code == 400


@pytest.mark.asyncio
@pytest.mark.parametrize("amount", [300.5, -1])
async def test_put_rejects_fractional_and_negative(client: AsyncClient, amount):
    response = await _put(client, "Groceries", "2026-10", amount)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_put_household_isolation(
    raw_client: AsyncClient, db_session: AsyncSession, two_households_two_users
):
    _, _, _, h2, token_a = two_households_two_users
    response = await raw_client.put(
        "/api/budgets",
        json={"category": "Groceries", "month": "2026-10", "amount": 300},
        headers=auth_headers(token_a),
    )
    assert response.status_code == 200

    rows = (
        (await db_session.execute(select(Budget).where(Budget.household_id == h2.id)))
        .scalars()
        .all()
    )
    assert rows == []
