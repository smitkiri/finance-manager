from datetime import date

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_date_range_returns_default_when_empty(
    client: AsyncClient,
):
    response = await client.get("/api/date-range")
    assert response.status_code == 200
    data = response.json()
    assert "start" in data
    assert "end" in data
    # Default end is today
    assert data["end"] == str(date.today())


@pytest.mark.asyncio
async def test_post_and_get_date_range(client: AsyncClient):
    payload = {"start": "2024-01-01", "end": "2024-06-30"}
    response = await client.post("/api/date-range", json=payload)
    assert response.status_code == 200
    assert response.json() == {"success": True}

    response = await client.get("/api/date-range")
    data = response.json()
    assert data["start"] == "2024-01-01"
    assert data["end"] == "2024-06-30"


@pytest.mark.asyncio
async def test_post_date_range_upsert(client: AsyncClient):
    """POST uses UPSERT — different dates create new row,
    GET returns most recent by created_at DESC."""
    await client.post(
        "/api/date-range",
        json={"start": "2024-01-01", "end": "2024-03-31"},
    )
    await client.post(
        "/api/date-range",
        json={"start": "2024-06-01", "end": "2024-12-31"},
    )

    response = await client.get("/api/date-range")
    data = response.json()
    assert data["start"] == "2024-06-01"
    assert data["end"] == "2024-12-31"


@pytest.mark.asyncio
async def test_post_same_date_range_twice_upserts(client: AsyncClient):
    """Same start/end should UPSERT (update created_at),
    not fail on unique constraint."""
    resp1 = await client.post(
        "/api/date-range",
        json={"start": "2024-01-01", "end": "2024-03-31"},
    )
    assert resp1.status_code == 200
    resp2 = await client.post(
        "/api/date-range",
        json={"start": "2024-01-01", "end": "2024-03-31"},
    )
    assert resp2.status_code == 200
