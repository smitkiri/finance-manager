import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_users_returns_default_when_empty(client: AsyncClient):
    response = await client.get("/api/users")
    assert response.status_code == 200
    data = response.json()
    assert "users" in data
    assert len(data["users"]) == 1
    assert data["users"][0]["id"] == "default-user"
    assert data["users"][0]["name"] == "Default"
    assert "createdAt" in data["users"][0]


@pytest.mark.asyncio
async def test_post_users_replaces_all(client: AsyncClient):
    payload = {
        "users": [{"id": "user1", "name": "Alice"}, {"id": "user2", "name": "Bob"}]
    }
    response = await client.post("/api/users", json=payload)
    assert response.status_code == 200
    assert response.json() == {"success": True, "count": 2}

    response = await client.get("/api/users")
    data = response.json()
    assert len(data["users"]) == 2
    names = {u["name"] for u in data["users"]}
    assert names == {"Alice", "Bob"}


@pytest.mark.asyncio
async def test_post_users_empty_list(client: AsyncClient):
    payload = {"users": []}
    response = await client.post("/api/users", json=payload)
    assert response.status_code == 200
    assert response.json() == {"success": True, "count": 0}


@pytest.mark.asyncio
async def test_post_users_with_created_at(client: AsyncClient):
    payload = {
        "users": [
            {"id": "user1", "name": "Alice", "createdAt": "2024-01-15T10:00:00+00:00"}
        ]
    }
    response = await client.post("/api/users", json=payload)
    assert response.status_code == 200

    response = await client.get("/api/users")
    data = response.json()
    assert len(data["users"]) == 1
    assert data["users"][0]["name"] == "Alice"
