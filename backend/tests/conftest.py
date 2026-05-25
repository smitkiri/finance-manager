from collections.abc import AsyncGenerator
from pathlib import Path
from urllib.parse import urlparse

import pytest
from alembic.config import Config as AlembicConfig
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from testcontainers.postgres import PostgresContainer

from alembic import command
from app.config import Settings, settings
from app.database import get_db
from app.main import app

# Module-level container (started once, reused across tests)
_container = None
_async_url = None
_sync_url = None
_schema_initialized = False

# Reset settings to clean defaults so tests are not affected by the
# developer's backend/.env file. Tests that need specific settings (e.g.
# teller enabled) should override them explicitly and restore after.
_clean = Settings(_env_file=None)  # ty: ignore[unknown-argument]
for field in Settings.model_fields:
    setattr(settings, field, getattr(_clean, field))


_BACKEND_ROOT = Path(__file__).resolve().parent.parent


# Default any model that has a `household_id` column but no value at insert
# time to the seeded test household. Production routes pass `household_id`
# explicitly; this is purely a test convenience to avoid editing every model
# construction in legacy tests.
def _install_household_default() -> None:
    from sqlalchemy import event

    from app.models import (
        Account,
        Category,
        Dashboard,
        DateRange,
        ImportSession,
        Report,
        Source,
        Transaction,
        User,
    )

    DEFAULT = "household-default"

    def _set_default(mapper, connection, target):  # noqa: ARG001
        if getattr(target, "household_id", None) is None:
            target.household_id = DEFAULT

    def _set_user_defaults(mapper, connection, target):  # noqa: ARG001
        if getattr(target, "household_id", None) is None:
            target.household_id = DEFAULT
        # email + password_hash became NOT NULL in A2; default placeholders so
        # tests that construct User() without them continue to work.
        if getattr(target, "email", None) is None:
            target.email = f"{target.id}@test.local"
        if getattr(target, "password_hash", None) is None:
            target.password_hash = ""

    for model in (
        Account,
        Category,
        Dashboard,
        DateRange,
        ImportSession,
        Report,
        Source,
        Transaction,
    ):
        event.listen(model, "before_insert", _set_default)
    event.listen(User, "before_insert", _set_user_defaults)


_install_household_default()


def _alembic_config_for_url(sync_url: str) -> AlembicConfig:
    """Build an Alembic Config pointing at the given sync DB URL.

    Uses alembic.ini's script_location but overrides sqlalchemy.url so the test
    container is targeted regardless of env vars / app settings.
    """
    cfg = AlembicConfig(str(_BACKEND_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(_BACKEND_ROOT / "alembic"))
    cfg.set_main_option("sqlalchemy.url", sync_url)
    return cfg


def _ensure_container() -> None:
    global _container, _async_url, _sync_url
    if _container is None:
        _container = PostgresContainer(
            image="postgres:15",
            username="test",
            password="test",
            dbname="test",
        )
        _container.start()
        url = _container.get_connection_url()
        _sync_url = url
        _async_url = url.replace("postgresql+psycopg2://", "postgresql+asyncpg://")


def get_test_db_url() -> str:
    _ensure_container()
    assert _async_url is not None
    return _async_url


def get_test_sync_db_url() -> str:
    _ensure_container()
    assert _sync_url is not None
    return _sync_url


def _initialize_schema_via_alembic() -> None:
    """Run alembic upgrade head against the test container.

    We override settings to point at the container so alembic's env.py
    (which builds its URL from app settings) connects to the right DB.
    """
    parsed = urlparse(get_test_sync_db_url())
    host = parsed.hostname or "localhost"
    port = parsed.port or 5432
    user = parsed.username or "test"
    password = parsed.password or "test"
    db = (parsed.path or "/test").lstrip("/")

    prev = (
        settings.db_host,
        settings.db_port,
        settings.db_user,
        settings.db_password,
        settings.db_name,
    )
    settings.db_host = host
    settings.db_port = port
    settings.db_user = user
    settings.db_password = password
    settings.db_name = db
    try:
        cfg = _alembic_config_for_url(get_test_sync_db_url())
        command.upgrade(cfg, "head")
    finally:
        (
            settings.db_host,
            settings.db_port,
            settings.db_user,
            settings.db_password,
            settings.db_name,
        ) = prev


def pytest_sessionfinish(session, exitstatus):
    global _container
    if _container is not None:
        _container.stop()
        _container = None


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession]:
    global _schema_initialized
    url = get_test_db_url()
    engine = create_async_engine(url, echo=False)

    if not _schema_initialized:
        _initialize_schema_via_alembic()
        _schema_initialized = True

    async with engine.connect() as connection:
        transaction = await connection.begin()
        session = AsyncSession(bind=connection, expire_on_commit=False)
        yield session
        await session.close()
        await transaction.rollback()

    await engine.dispose()


class _AlembicRunner:
    """Helper that exposes upgrade/downgrade against the shared test DB.

    Used by migration round-trip tests. Operations COMMIT (DDL is not
    transactional in PG for many statements), so tests using this should
    return the DB to head before yielding.
    """

    def __init__(self, sync_url: str) -> None:
        self._cfg = _alembic_config_for_url(sync_url)
        self._sync_url = sync_url

    def upgrade(self, target: str = "head") -> None:
        self._with_settings(lambda: command.upgrade(self._cfg, target))

    def downgrade(self, target: str) -> None:
        self._with_settings(lambda: command.downgrade(self._cfg, target))

    def _with_settings(self, fn):
        parsed = urlparse(self._sync_url)
        host = parsed.hostname or "localhost"
        port = parsed.port or 5432
        user = parsed.username or "test"
        password = parsed.password or "test"
        db = (parsed.path or "/test").lstrip("/")
        prev = (
            settings.db_host,
            settings.db_port,
            settings.db_user,
            settings.db_password,
            settings.db_name,
        )
        settings.db_host = host
        settings.db_port = port
        settings.db_user = user
        settings.db_password = password
        settings.db_name = db
        try:
            fn()
        finally:
            (
                settings.db_host,
                settings.db_port,
                settings.db_user,
                settings.db_password,
                settings.db_name,
            ) = prev


@pytest.fixture
def alembic_runner() -> _AlembicRunner:
    """Provides upgrade/downgrade against the shared test DB.

    Tests must restore the DB to head before yielding (use a try/finally).
    """
    return _AlembicRunner(get_test_sync_db_url())


DEFAULT_TEST_HOUSEHOLD_ID = "household-default"


class _AuthInjectingClient(AsyncClient):
    """Test-only AsyncClient that auto-attaches a Bearer token for /api calls.

    All existing tests were written before A2 added auth; this keeps them
    working without per-test Authorization plumbing. Tests that need to
    exercise the missing-auth 401 path should use `raw_client` instead.
    """

    def __init__(self, *args, token: str, **kwargs):
        super().__init__(*args, **kwargs)
        self._token = token

    async def request(self, method, url, **kwargs):
        url_str = str(url)
        if url_str.startswith("/api"):
            headers = kwargs.get("headers") or {}
            if "authorization" not in {k.lower() for k in headers}:
                headers = {**headers, "Authorization": f"Bearer {self._token}"}
                kwargs["headers"] = headers
        return await super().request(method, url, **kwargs)


@pytest.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient]:
    """Authenticated test client. Seeds a default household + user once per
    test and injects a Bearer token on every /api request."""
    from app.models import User
    from app.utils.jwt_tokens import encode_access_token
    from app.utils.passwords import hash_password

    # Force a stable secret for the token-encoder.
    settings.jwt_signing_secret = "test-secret"
    settings.jwt_access_token_ttl_days = 30

    # The DEFAULT_TEST_HOUSEHOLD_ID row was seeded by the A1 migration and
    # is already committed; only the user needs to be inserted in this test
    # transaction (and will roll back with it).
    db_session.add(
        User(
            id="default-user",
            name="Default",
            email="default@test.local",
            password_hash=hash_password("test-pass-12"),
            household_id=DEFAULT_TEST_HOUSEHOLD_ID,
        )
    )
    await db_session.flush()

    token = encode_access_token(
        user_id="default-user", household_id=DEFAULT_TEST_HOUSEHOLD_ID
    )

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    async with _AuthInjectingClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        token=token,
    ) as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture
async def raw_client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient]:
    """A vanilla AsyncClient that does NOT auto-inject householdId.

    Use this in tests that verify missing-param error responses or that need
    to bypass the auto-inject for any reason.
    """

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac
    app.dependency_overrides.clear()
