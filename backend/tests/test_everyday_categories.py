import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Household
from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_get_returns_empty_list_by_default(client: AsyncClient):
    response = await client.get("/api/everyday-categories")
    assert response.status_code == 200
    assert response.json() == {"categories": []}


@pytest.mark.asyncio
async def test_put_then_get_round_trip(client: AsyncClient):
    response = await client.put(
        "/api/everyday-categories", json={"categories": ["Groceries", "Gas"]}
    )
    assert response.status_code == 200
    assert response.json() == {"categories": ["Groceries", "Gas"]}

    response = await client.get("/api/everyday-categories")
    assert response.json() == {"categories": ["Groceries", "Gas"]}


@pytest.mark.asyncio
async def test_put_dedupes_preserving_order(client: AsyncClient):
    response = await client.put(
        "/api/everyday-categories", json={"categories": ["Gas", "Groceries", "Gas"]}
    )
    assert response.status_code == 200
    assert response.json() == {"categories": ["Gas", "Groceries"]}


@pytest.mark.asyncio
async def test_put_rejects_more_than_50(client: AsyncClient):
    names = [f"Cat {i}" for i in range(51)]
    response = await client.put("/api/everyday-categories", json={"categories": names})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_put_rejects_non_string_items(client: AsyncClient):
    response = await client.put("/api/everyday-categories", json={"categories": [1]})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_household_isolation(
    raw_client: AsyncClient,
    db_session: AsyncSession,
    two_households_two_users,
):
    _, _, _, h2, token_a = two_households_two_users
    response = await raw_client.put(
        "/api/everyday-categories",
        json={"categories": ["Groceries"]},
        headers=auth_headers(token_a),
    )
    assert response.status_code == 200

    other = await db_session.get(Household, h2.id)
    assert other is not None
    await db_session.refresh(other)
    assert other.everyday_categories == []
