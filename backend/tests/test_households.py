import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_households_returns_seeded_household(raw_client: AsyncClient):
    """GET /api/households returns the default household seeded by the migration."""
    response = await raw_client.get("/api/households")
    assert response.status_code == 200
    households = response.json()
    assert len(households) >= 1
    assert any(h["id"] == "household-default" for h in households)


@pytest.mark.asyncio
async def test_get_households_does_not_require_household_id(raw_client: AsyncClient):
    """The /households endpoint must be reachable without a householdId param,
    so the frontend can discover its household on startup."""
    response = await raw_client.get("/api/households")
    assert response.status_code == 200
