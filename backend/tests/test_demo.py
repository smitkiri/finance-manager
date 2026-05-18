import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_demo_config_disabled(client: AsyncClient):
    """When demo mode is not enabled, returns enabled=false."""
    response = await client.get("/api/demo/config")
    assert response.status_code == 200
    assert response.json() == {"enabled": False}


@pytest.mark.asyncio
async def test_demo_config_enabled(client: AsyncClient):
    """When demo mode is enabled, returns enabled=true."""
    from app.config import settings

    original = settings.finance_manager_demo_mode
    settings.finance_manager_demo_mode = True
    try:
        response = await client.get("/api/demo/config")
        assert response.status_code == 200
        assert response.json() == {"enabled": True}
    finally:
        settings.finance_manager_demo_mode = original
