from datetime import date
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import Transaction


@pytest.mark.asyncio
async def test_get_categories_returns_defaults_when_empty(client: AsyncClient):
    response = await client.get("/api/categories")
    assert response.status_code == 200
    data = response.json()
    assert "categories" in data
    assert isinstance(data["categories"], list)
    assert "Food & Drink" in data["categories"]
    assert "Shopping" in data["categories"]
    assert "Uncategorized" in data["categories"]


@pytest.mark.asyncio
async def test_post_categories_replaces_all(client: AsyncClient):
    payload = {"categories": ["Food", "Transport", "Entertainment"]}
    response = await client.post("/api/categories", json=payload)
    assert response.status_code == 200
    assert response.json() == {"success": True, "count": 3}

    response = await client.get("/api/categories")
    data = response.json()
    assert set(data["categories"]) == {"Food", "Transport", "Entertainment"}


@pytest.mark.asyncio
async def test_post_categories_empty_list(client: AsyncClient):
    # Post empty list, then GET should return defaults
    payload = {"categories": []}
    response = await client.post("/api/categories", json=payload)
    assert response.status_code == 200
    assert response.json() == {"success": True, "count": 0}

    response = await client.get("/api/categories")
    data = response.json()
    # Empty categories should return defaults
    assert "Food & Drink" in data["categories"]


@pytest.mark.asyncio
async def test_post_categories_with_duplicates(client: AsyncClient):
    """Express uses ON CONFLICT DO NOTHING, so duplicates are silently ignored."""
    payload = {"categories": ["Food", "Food", "Transport"]}
    response = await client.post("/api/categories", json=payload)
    assert response.status_code == 200
    # Count reflects input length, not deduplicated count (matches Express behavior)
    assert response.json() == {"success": True, "count": 3}

    response = await client.get("/api/categories")
    data = response.json()
    assert set(data["categories"]) == {"Food", "Transport"}


@pytest.mark.asyncio
async def test_get_labels_returns_unique_labels(
    client: AsyncClient, db_session: AsyncSession
):
    db_session.add(
        Transaction(
            id="t1",
            date=date(2024, 1, 1),
            description="Test",
            category="Food",
            amount=Decimal("10.00"),
            type="expense",
            user_id="u1",
            labels=["groceries", "weekly"],
        )
    )
    db_session.add(
        Transaction(
            id="t2",
            date=date(2024, 1, 2),
            description="Test2",
            category="Food",
            amount=Decimal("20.00"),
            type="expense",
            user_id="u1",
            labels=["groceries", "monthly"],
        )
    )
    await db_session.flush()

    response = await client.get("/api/labels")
    assert response.status_code == 200
    data = response.json()
    assert "labels" in data
    assert set(data["labels"]) == {"groceries", "weekly", "monthly"}


@pytest.mark.asyncio
async def test_get_labels_empty_when_no_transactions(client: AsyncClient):
    response = await client.get("/api/labels")
    assert response.status_code == 200
    assert response.json() == {"labels": []}
