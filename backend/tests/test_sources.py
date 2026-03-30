import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_sources_empty(client: AsyncClient):
    response = await client.get("/api/sources")
    assert response.status_code == 200
    # Express returns bare array (not wrapped)
    assert response.json() == []


@pytest.mark.asyncio
async def test_create_source(client: AsyncClient):
    payload = {
        "source": {
            "id": "src1",
            "name": "Chase Credit Card",
            "mappings": [{"from": "Date", "to": "date"}],
            "flipIncomeExpense": False,
        }
    }
    response = await client.post("/api/sources", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert len(data["sources"]) == 1
    assert data["sources"][0]["name"] == "Chase Credit Card"
    assert data["sources"][0]["mappings"] == [{"from": "Date", "to": "date"}]
    assert data["sources"][0]["flipIncomeExpense"] is False


@pytest.mark.asyncio
async def test_create_source_duplicate_name_fails(client: AsyncClient):
    payload = {"source": {"id": "src1", "name": "Chase", "mappings": []}}
    await client.post("/api/sources", json=payload)

    payload = {"source": {"id": "src2", "name": "Chase", "mappings": []}}
    response = await client.post("/api/sources", json=payload)
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_update_source(client: AsyncClient):
    payload = {"source": {"id": "src1", "name": "Chase", "mappings": []}}
    await client.post("/api/sources", json=payload)

    update_payload = {
        "source": {
            "name": "Chase Updated",
            "mappings": [],
            "flipIncomeExpense": True,
        }
    }
    response = await client.put("/api/sources/src1", json=update_payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["sources"][0]["name"] == "Chase Updated"
    assert data["sources"][0]["flipIncomeExpense"] is True


@pytest.mark.asyncio
async def test_update_source_not_found(client: AsyncClient):
    response = await client.put(
        "/api/sources/nonexistent",
        json={"source": {"name": "X", "mappings": []}},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_update_source_name_conflict(client: AsyncClient):
    await client.post(
        "/api/sources",
        json={"source": {"id": "s1", "name": "A", "mappings": []}},
    )
    await client.post(
        "/api/sources",
        json={"source": {"id": "s2", "name": "B", "mappings": []}},
    )

    response = await client.put(
        "/api/sources/s2",
        json={"source": {"name": "A", "mappings": []}},
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_delete_source(client: AsyncClient):
    payload = {"source": {"id": "src1", "name": "Chase", "mappings": []}}
    await client.post("/api/sources", json=payload)

    response = await client.delete("/api/sources/Chase")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["sources"] == []


@pytest.mark.asyncio
async def test_delete_nonexistent_source_succeeds(client: AsyncClient):
    """Express silently succeeds when deleting non-existent source."""
    response = await client.delete("/api/sources/Nonexistent")
    assert response.status_code == 200
    assert response.json()["success"] is True
