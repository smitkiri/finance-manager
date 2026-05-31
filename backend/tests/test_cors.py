"""Regression: credentialed cross-origin requests from the dev SPA must work.

Phase 4 moved the JWT into an HttpOnly cookie, so the frontend now sends
`credentials: 'include'` on every fetch. The CORS spec forbids responding
with `Access-Control-Allow-Origin: *` to credentialed requests; the browser
silently blocks the response and surfaces it as
`CORS request did not succeed. Status code: (null)`. These tests lock in
the explicit-origin + allow-credentials config that unbroke local dev.
"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_preflight_echoes_allowed_origin_with_credentials(
    raw_client: AsyncClient,
) -> None:
    resp = await raw_client.options(
        "/api/auth/login",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:3000"
    assert resp.headers.get("access-control-allow-credentials") == "true"


@pytest.mark.asyncio
async def test_preflight_rejects_unknown_origin(raw_client: AsyncClient) -> None:
    resp = await raw_client.options(
        "/api/auth/login",
        headers={
            "Origin": "http://evil.example.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert "access-control-allow-origin" not in {k.lower() for k in resp.headers}
