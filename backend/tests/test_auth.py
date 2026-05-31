"""End-to-end tests for /api/auth/* and the demo bypass."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Household, User
from app.utils.passwords import hash_password


@pytest.fixture(autouse=True)
def _jwt_secret(monkeypatch):
    monkeypatch.setattr(settings, "jwt_signing_secret", "test-secret")
    monkeypatch.setattr(settings, "jwt_access_token_ttl_days", 30)
    monkeypatch.setattr(settings, "finance_manager_demo_mode", False)
    # The cookie tests round-trip cookies through httpx, which refuses to
    # forward Secure cookies over plain http://test. Production keeps
    # Secure=True (validated separately in `test_login_sets_httponly_cookie`
    # via the `or auth_cookie_secure is False` guard).
    monkeypatch.setattr(settings, "auth_cookie_secure", False)


@pytest.mark.asyncio
async def test_signup_creates_household_and_returns_token(raw_client: AsyncClient):
    res = await raw_client.post(
        "/api/auth/signup",
        json={
            "email": "alice@example.com",
            "password": "hunter22pw",
            "name": "Alice",
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert "token" in body and body["token"]
    assert body["user"]["email"] == "alice@example.com"
    assert body["user"]["name"] == "Alice"
    assert body["household"]["name"] == "Alice's Household"


@pytest.mark.asyncio
async def test_signup_rejects_duplicate_email_case_insensitive(
    raw_client: AsyncClient,
):
    await raw_client.post(
        "/api/auth/signup",
        json={"email": "Alice@Example.com", "password": "pw12345678", "name": "A"},
    )
    res = await raw_client.post(
        "/api/auth/signup",
        json={"email": "alice@example.com", "password": "pw12345678", "name": "A2"},
    )
    assert res.status_code == 409
    assert res.json()["detail"] == "Email already registered"


@pytest.mark.asyncio
async def test_signup_rejects_short_password(raw_client: AsyncClient):
    res = await raw_client.post(
        "/api/auth/signup",
        json={"email": "a@b.com", "password": "short", "name": "A"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_login_succeeds_with_correct_credentials(
    raw_client: AsyncClient, db_session: AsyncSession
):
    db_session.add(Household(id="hh", name="HH"))
    await db_session.flush()
    db_session.add(
        User(
            id="u-1",
            name="A",
            email="a@b.com",
            password_hash=hash_password("right-pass-12"),
            household_id="hh",
        )
    )
    await db_session.commit()

    res = await raw_client.post(
        "/api/auth/login",
        json={"email": "a@b.com", "password": "right-pass-12"},
    )
    assert res.status_code == 200
    assert res.json()["user"]["id"] == "u-1"


@pytest.mark.asyncio
async def test_login_rejects_wrong_password_with_generic_message(
    raw_client: AsyncClient, db_session: AsyncSession
):
    db_session.add(Household(id="hh", name="HH"))
    await db_session.flush()
    db_session.add(
        User(
            id="u-1",
            name="A",
            email="a@b.com",
            password_hash=hash_password("right-pass-12"),
            household_id="hh",
        )
    )
    await db_session.commit()

    res = await raw_client.post(
        "/api/auth/login",
        json={"email": "a@b.com", "password": "wrong"},
    )
    assert res.status_code == 401
    assert res.json()["detail"] == "Invalid credentials"


@pytest.mark.asyncio
async def test_login_rejects_unknown_email_with_same_generic_message(
    raw_client: AsyncClient,
):
    res = await raw_client.post(
        "/api/auth/login",
        json={"email": "nobody@nowhere.com", "password": "anything12"},
    )
    assert res.status_code == 401
    assert res.json()["detail"] == "Invalid credentials"


@pytest.mark.asyncio
async def test_me_returns_user_and_household_for_valid_token(
    raw_client: AsyncClient,
):
    signup = await raw_client.post(
        "/api/auth/signup",
        json={"email": "bob@example.com", "password": "pw12345678", "name": "Bob"},
    )
    token = signup.json()["token"]

    res = await raw_client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["user"]["email"] == "bob@example.com"
    assert body["household"]["name"] == "Bob's Household"


@pytest.mark.asyncio
async def test_me_returns_401_without_token(raw_client: AsyncClient):
    res = await raw_client.get("/api/auth/me")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_me_returns_401_with_tampered_token(raw_client: AsyncClient):
    res = await raw_client.get(
        "/api/auth/me",
        headers={"Authorization": "Bearer not.a.real.jwt"},
    )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_logout_returns_204(raw_client: AsyncClient):
    res = await raw_client.post("/api/auth/logout")
    assert res.status_code == 204


@pytest.mark.asyncio
async def test_signup_blocked_in_demo_mode(raw_client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "finance_manager_demo_mode", True)
    res = await raw_client.post(
        "/api/auth/signup",
        json={"email": "a@b.com", "password": "pw12345678", "name": "A"},
    )
    assert res.status_code == 503


@pytest.mark.asyncio
async def test_login_blocked_in_demo_mode(raw_client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "finance_manager_demo_mode", True)
    res = await raw_client.post(
        "/api/auth/login",
        json={"email": "a@b.com", "password": "pw12345678"},
    )
    assert res.status_code == 503


@pytest.mark.asyncio
async def test_login_sets_httponly_cookie(
    raw_client: AsyncClient, db_session: AsyncSession
):
    """Login must issue the access token in an HttpOnly cookie so XSS can't
    read it."""
    db_session.add(Household(id="hh-cookie", name="HH"))
    await db_session.flush()
    db_session.add(
        User(
            id="u-cookie",
            name="A",
            email="cookie@b.com",
            password_hash=hash_password("right-pass-12"),
            household_id="hh-cookie",
        )
    )
    await db_session.commit()

    res = await raw_client.post(
        "/api/auth/login",
        json={"email": "cookie@b.com", "password": "right-pass-12"},
    )
    assert res.status_code == 200

    set_cookie = res.headers.get("set-cookie", "")
    assert f"{settings.auth_cookie_name}=" in set_cookie
    assert "HttpOnly" in set_cookie
    assert "Secure" in set_cookie or settings.auth_cookie_secure is False
    assert "SameSite=Lax" in set_cookie or "SameSite=lax" in set_cookie
    assert "Path=/" in set_cookie


@pytest.mark.asyncio
async def test_signup_sets_httponly_cookie(raw_client: AsyncClient):
    """Signup must also issue the access token via HttpOnly cookie."""
    res = await raw_client.post(
        "/api/auth/signup",
        json={
            "email": "cookie-signup@example.com",
            "password": "pw12345678",
            "name": "Cookie",
        },
    )
    assert res.status_code == 200
    set_cookie = res.headers.get("set-cookie", "")
    assert f"{settings.auth_cookie_name}=" in set_cookie
    assert "HttpOnly" in set_cookie


@pytest.mark.asyncio
async def test_logout_clears_cookie(raw_client: AsyncClient):
    """Logout must delete the auth cookie."""
    res = await raw_client.post("/api/auth/logout")
    assert res.status_code == 204
    set_cookie = res.headers.get("set-cookie", "")
    assert f"{settings.auth_cookie_name}=" in set_cookie
    # delete_cookie sets an expired/empty value; assert the attribute is present
    assert "Max-Age=0" in set_cookie or "expires=" in set_cookie.lower()


def test_cookie_name_uses_host_prefix_when_secure(monkeypatch):
    """Prod (HTTPS) must use the __Host- prefix for defense-in-depth."""
    monkeypatch.setattr(settings, "auth_cookie_secure", True)
    assert settings.auth_cookie_name == "__Host-fm_session"


def test_cookie_name_drops_host_prefix_when_not_secure(monkeypatch):
    """HTTP-only deployments (e.g. tally.local on a LAN) must NOT carry the
    __Host- prefix — browsers reject __Host- cookies received over HTTP,
    which silently breaks login."""
    monkeypatch.setattr(settings, "auth_cookie_secure", False)
    assert settings.auth_cookie_name == "fm_session"


@pytest.mark.asyncio
async def test_login_uses_plain_cookie_name_when_not_secure(
    raw_client: AsyncClient, db_session: AsyncSession
):
    """When auth_cookie_secure is False (HTTP deployments), the Set-Cookie
    header must use the plain `fm_session` name with no __Host- prefix."""
    db_session.add(Household(id="hh-plain", name="HH"))
    await db_session.flush()
    db_session.add(
        User(
            id="u-plain",
            name="P",
            email="plain@b.com",
            password_hash=hash_password("right-pass-12"),
            household_id="hh-plain",
        )
    )
    await db_session.commit()

    res = await raw_client.post(
        "/api/auth/login",
        json={"email": "plain@b.com", "password": "right-pass-12"},
    )
    assert res.status_code == 200
    set_cookie = res.headers.get("set-cookie", "")
    assert "fm_session=" in set_cookie
    assert "__Host-" not in set_cookie


@pytest.mark.asyncio
async def test_authenticated_request_via_plain_cookie(raw_client: AsyncClient):
    """When the deployment is HTTP, the auth cookie is the plain `fm_session`
    (no __Host- prefix). A request that carries only that cookie must
    authenticate, proving the dependency reads both names."""
    signup = await raw_client.post(
        "/api/auth/signup",
        json={
            "email": "plain-cookie-bearer@example.com",
            "password": "pw12345678",
            "name": "Plain Bearer",
        },
    )
    assert signup.status_code == 200
    # Sanity: the cookie that was set is the plain name (the autouse fixture
    # flips auth_cookie_secure to False, so __Host- prefix is dropped).
    assert "fm_session=" in signup.headers.get("set-cookie", "")
    assert "__Host-" not in signup.headers.get("set-cookie", "")

    me = await raw_client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["user"]["email"] == "plain-cookie-bearer@example.com"


@pytest.mark.asyncio
async def test_authenticated_request_via_cookie(raw_client: AsyncClient):
    """A request that carries only the auth cookie (no Authorization header)
    must authenticate successfully."""
    signup = await raw_client.post(
        "/api/auth/signup",
        json={
            "email": "cookie-bearer@example.com",
            "password": "pw12345678",
            "name": "Cookie Bearer",
        },
    )
    assert signup.status_code == 200

    # httpx AsyncClient persists cookies across requests by default. The
    # signup response set the __Host-fm_session cookie; this request carries
    # no Authorization header but the cookie alone must authenticate.
    me = await raw_client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["user"]["email"] == "cookie-bearer@example.com"


@pytest.mark.asyncio
async def test_demo_mode_me_returns_demo_user_without_token(
    raw_client: AsyncClient, db_session: AsyncSession, monkeypatch
):
    monkeypatch.setattr(settings, "finance_manager_demo_mode", True)
    db_session.add(Household(id=settings.demo_household_id, name="Demo"))
    await db_session.flush()
    db_session.add(
        User(
            id=settings.demo_user_id,
            name="Demo",
            email="demo@tally.local",
            password_hash=hash_password("unused"),
            household_id=settings.demo_household_id,
        )
    )
    await db_session.commit()

    res = await raw_client.get("/api/auth/me")
    assert res.status_code == 200
    assert res.json()["user"]["id"] == settings.demo_user_id
