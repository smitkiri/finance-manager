from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from testcontainers.postgres import PostgresContainer

from app.config import Settings, settings
from app.database import get_db
from app.main import app
from app.models.base import Base

# Module-level container (started once, reused across tests)
_container = None
_async_url = None
_tables_created = False

# Reset settings to clean defaults so tests are not affected by the
# developer's backend/.env file. Tests that need specific settings (e.g.
# teller enabled) should override them explicitly and restore after.
_clean = Settings(_env_file=None)  # ty: ignore[unknown-argument]
for field in Settings.model_fields:
    setattr(settings, field, getattr(_clean, field))


def get_test_db_url():
    global _container, _async_url
    if _container is None:
        _container = PostgresContainer(
            image="postgres:15",
            username="test",
            password="test",
            dbname="test",
        )
        _container.start()
        url = _container.get_connection_url()
        _async_url = url.replace("postgresql+psycopg2://", "postgresql+asyncpg://")
    return _async_url


def pytest_sessionfinish(session, exitstatus):
    global _container
    if _container is not None:
        _container.stop()
        _container = None


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession]:
    global _tables_created
    url = get_test_db_url()
    engine = create_async_engine(url, echo=False)

    if not _tables_created:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        _tables_created = True

    async with engine.connect() as connection:
        transaction = await connection.begin()
        session = AsyncSession(bind=connection, expire_on_commit=False)
        yield session
        await session.close()
        await transaction.rollback()

    await engine.dispose()


@pytest.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient]:
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac
    app.dependency_overrides.clear()
