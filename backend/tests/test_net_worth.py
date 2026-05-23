from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account, AccountBalance


@pytest.mark.asyncio
async def test_get_accounts_empty(client: AsyncClient):
    response = await client.get("/api/accounts")
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_get_accounts_returns_accounts(
    client: AsyncClient, db_session: AsyncSession
):
    acct = Account(id="a1", created_by_user_id="u1", name="Checking", type="asset")
    db_session.add(acct)
    await db_session.flush()

    response = await client.get("/api/accounts")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == "a1"
    assert data[0]["userId"] == "u1"
    assert data[0]["name"] == "Checking"
    assert data[0]["type"] == "asset"


@pytest.mark.asyncio
async def test_get_accounts_filtered_by_user(
    client: AsyncClient, db_session: AsyncSession
):
    db_session.add(
        Account(id="a1", created_by_user_id="u1", name="Checking", type="asset")
    )
    db_session.add(
        Account(id="a2", created_by_user_id="u2", name="Savings", type="asset")
    )
    await db_session.flush()

    response = await client.get("/api/accounts", params={"userId": "u1"})
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == "a1"


@pytest.mark.asyncio
async def test_create_account(client: AsyncClient):
    response = await client.post(
        "/api/accounts",
        json={"id": "a1", "userId": "u1", "name": "Checking", "type": "asset"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "a1"
    assert data["userId"] == "u1"
    assert data["name"] == "Checking"
    assert data["type"] == "asset"
    assert "createdAt" in data


@pytest.mark.asyncio
async def test_create_account_invalid_type(client: AsyncClient):
    response = await client.post(
        "/api/accounts",
        json={"id": "a1", "userId": "u1", "name": "Checking", "type": "invalid"},
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_update_account(client: AsyncClient, db_session: AsyncSession):
    db_session.add(
        Account(id="a1", created_by_user_id="u1", name="Checking", type="asset")
    )
    await db_session.flush()

    response = await client.put(
        "/api/accounts/a1",
        json={"name": "Savings", "type": "liability"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Savings"
    assert data["type"] == "liability"


@pytest.mark.asyncio
async def test_update_account_not_found(client: AsyncClient):
    response = await client.put(
        "/api/accounts/nonexistent",
        json={"name": "X", "type": "asset"},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_delete_account(client: AsyncClient, db_session: AsyncSession):
    db_session.add(
        Account(id="a1", created_by_user_id="u1", name="Checking", type="asset")
    )
    await db_session.flush()

    response = await client.delete("/api/accounts/a1")
    assert response.status_code == 200
    assert response.json() == {"success": True}

    # Verify gone
    response = await client.get("/api/accounts")
    assert response.json() == []


@pytest.mark.asyncio
async def test_delete_account_not_found(client: AsyncClient):
    response = await client.delete("/api/accounts/nonexistent")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_add_balance(client: AsyncClient, db_session: AsyncSession):
    db_session.add(
        Account(id="a1", created_by_user_id="u1", name="Checking", type="asset")
    )
    await db_session.flush()

    response = await client.post(
        "/api/accounts/a1/balances",
        json={
            "id": "b1",
            "balance": 1500.50,
            "date": "2024-06-01",
            "note": "June balance",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "b1"
    assert data["accountId"] == "a1"
    assert data["balance"] == 1500.50
    assert data["date"] == "2024-06-01"
    assert data["note"] == "June balance"


@pytest.mark.asyncio
async def test_add_balance_account_not_found(client: AsyncClient):
    response = await client.post(
        "/api/accounts/nonexistent/balances",
        json={"id": "b1", "balance": 100, "date": "2024-06-01"},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_balances(client: AsyncClient, db_session: AsyncSession):
    db_session.add(
        Account(id="a1", created_by_user_id="u1", name="Checking", type="asset")
    )
    await db_session.flush()
    db_session.add(
        AccountBalance(id="b1", account_id="a1", balance=1000, date=date(2024, 5, 1))
    )
    db_session.add(
        AccountBalance(id="b2", account_id="a1", balance=1500, date=date(2024, 6, 1))
    )
    await db_session.flush()

    response = await client.get("/api/accounts/a1/balances")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    # Ordered by date DESC
    assert data[0]["balance"] == 1500.0
    assert data[1]["balance"] == 1000.0


@pytest.mark.asyncio
async def test_delete_balance(client: AsyncClient, db_session: AsyncSession):
    db_session.add(
        Account(id="a1", created_by_user_id="u1", name="Checking", type="asset")
    )
    await db_session.flush()
    db_session.add(
        AccountBalance(id="b1", account_id="a1", balance=1000, date=date(2024, 5, 1))
    )
    await db_session.flush()

    response = await client.delete("/api/accounts/a1/balances/b1")
    assert response.status_code == 200
    assert response.json() == {"success": True}


@pytest.mark.asyncio
async def test_delete_balance_not_found(client: AsyncClient, db_session: AsyncSession):
    db_session.add(
        Account(id="a1", created_by_user_id="u1", name="Checking", type="asset")
    )
    await db_session.flush()

    response = await client.delete("/api/accounts/a1/balances/nonexistent")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_net_worth_summary_empty(client: AsyncClient):
    response = await client.get("/api/net-worth/summary")
    assert response.status_code == 200
    data = response.json()
    assert data == {"totalAssets": 0, "totalLiabilities": 0, "netWorth": 0}


@pytest.mark.asyncio
async def test_net_worth_summary(client: AsyncClient, db_session: AsyncSession):
    db_session.add(
        Account(id="a1", created_by_user_id="u1", name="Checking", type="asset")
    )
    db_session.add(
        Account(id="a2", created_by_user_id="u1", name="Credit Card", type="liability")
    )
    await db_session.flush()
    db_session.add(
        AccountBalance(id="b1", account_id="a1", balance=5000, date=date(2024, 6, 1))
    )
    db_session.add(
        AccountBalance(id="b2", account_id="a2", balance=1200, date=date(2024, 6, 1))
    )
    await db_session.flush()

    response = await client.get("/api/net-worth/summary")
    assert response.status_code == 200
    data = response.json()
    assert data["totalAssets"] == 5000.0
    assert data["totalLiabilities"] == 1200.0
    assert data["netWorth"] == 3800.0


@pytest.mark.asyncio
async def test_net_worth_summary_filtered_by_user(
    client: AsyncClient, db_session: AsyncSession
):
    db_session.add(
        Account(id="a1", created_by_user_id="u1", name="Checking", type="asset")
    )
    db_session.add(
        Account(id="a2", created_by_user_id="u2", name="Savings", type="asset")
    )
    await db_session.flush()
    db_session.add(
        AccountBalance(id="b1", account_id="a1", balance=5000, date=date(2024, 6, 1))
    )
    db_session.add(
        AccountBalance(id="b2", account_id="a2", balance=3000, date=date(2024, 6, 1))
    )
    await db_session.flush()

    response = await client.get("/api/net-worth/summary", params={"userId": "u1"})
    data = response.json()
    assert data["totalAssets"] == 5000.0
    assert data["netWorth"] == 5000.0


@pytest.mark.asyncio
async def test_net_worth_summary_uses_latest_balance(
    client: AsyncClient, db_session: AsyncSession
):
    """Summary should use the most recent balance per account, not sum all balances."""
    db_session.add(
        Account(id="a1", created_by_user_id="u1", name="Checking", type="asset")
    )
    await db_session.flush()
    db_session.add(
        AccountBalance(id="b1", account_id="a1", balance=1000, date=date(2024, 5, 1))
    )
    db_session.add(
        AccountBalance(id="b2", account_id="a1", balance=2000, date=date(2024, 6, 1))
    )
    await db_session.flush()

    response = await client.get("/api/net-worth/summary")
    data = response.json()
    assert data["totalAssets"] == 2000.0


@pytest.mark.asyncio
async def test_net_worth_history(client: AsyncClient, db_session: AsyncSession):
    db_session.add(
        Account(id="a1", created_by_user_id="u1", name="Checking", type="asset")
    )
    db_session.add(
        Account(id="a2", created_by_user_id="u1", name="Loan", type="liability")
    )
    await db_session.flush()
    db_session.add(
        AccountBalance(id="b1", account_id="a1", balance=3000, date=date(2024, 5, 1))
    )
    db_session.add(
        AccountBalance(id="b2", account_id="a1", balance=5000, date=date(2024, 6, 1))
    )
    db_session.add(
        AccountBalance(id="b3", account_id="a2", balance=1000, date=date(2024, 6, 1))
    )
    await db_session.flush()

    response = await client.get("/api/net-worth/history")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 2
    # First date: only asset has data
    assert data[0]["date"] == "2024-05-01"
    assert data[0]["totalAssets"] == 3000.0
    assert data[0]["totalLiabilities"] == 0
    # Second date: both have data
    assert data[1]["date"] == "2024-06-01"
    assert data[1]["totalAssets"] == 5000.0
    assert data[1]["totalLiabilities"] == 1000.0
    assert data[1]["netWorth"] == 4000.0


@pytest.mark.asyncio
async def test_net_worth_history_empty(client: AsyncClient):
    response = await client.get("/api/net-worth/history")
    assert response.status_code == 200
    assert response.json() == []
