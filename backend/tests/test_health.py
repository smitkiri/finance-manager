import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app


@pytest.mark.asyncio
async def test_health_ok_when_db_reachable(client: AsyncClient):
    res = await client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "database": "ok"}


@pytest.mark.asyncio
async def test_health_requires_no_auth(db_session: AsyncSession):
    async def _override():
        yield db_session

    app.dependency_overrides[get_db] = _override
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as anon:
            res = await anon.get("/api/health")
        assert res.status_code == 200
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_health_503_when_db_unreachable():
    class _BrokenSession:
        async def execute(self, *args, **kwargs):
            raise ConnectionRefusedError("db down")

    async def _override():
        yield _BrokenSession()

    app.dependency_overrides[get_db] = _override
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as anon:
            res = await anon.get("/api/health")
        assert res.status_code == 503
        assert res.json() == {"status": "error", "database": "unreachable"}
    finally:
        app.dependency_overrides.pop(get_db, None)
