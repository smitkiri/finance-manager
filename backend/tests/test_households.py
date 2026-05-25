import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_households_returns_callers_household(client: AsyncClient):
    """GET /api/households returns the caller's household (single-element list)."""
    response = await client.get("/api/households")
    assert response.status_code == 200
    households = response.json()
    assert len(households) == 1
    assert households[0]["id"] == "household-default"


@pytest.mark.asyncio
async def test_get_households_requires_auth(raw_client: AsyncClient):
    """Post-A2, /households is no longer reachable without a token."""
    response = await raw_client.get("/api/households")
    assert response.status_code == 401
