import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account


@pytest.mark.asyncio
async def test_get_accounts_empty(client: AsyncClient):
    response = await client.get("/api/accounts")
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_get_accounts_returns_accounts(
    client: AsyncClient, db_session: AsyncSession
):
    acct = Account(id="a1", user_id="u1", name="Checking", type="asset")
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
    db_session.add(Account(id="a1", user_id="u1", name="Checking", type="asset"))
    db_session.add(Account(id="a2", user_id="u2", name="Savings", type="asset"))
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
    db_session.add(Account(id="a1", user_id="u1", name="Checking", type="asset"))
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
    db_session.add(Account(id="a1", user_id="u1", name="Checking", type="asset"))
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
