import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_reports_empty(client: AsyncClient):
    response = await client.get("/api/reports")
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_create_report(client: AsyncClient):
    payload = {
        "report": {
            "id": "rpt1",
            "name": "Monthly Summary",
            "description": "My report",
            "filters": {"dateFrom": "2024-01-01", "dateTo": "2024-12-31"},
        }
    }
    response = await client.post("/api/reports", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["reportId"] == "rpt1"


@pytest.mark.asyncio
async def test_get_reports_after_create(client: AsyncClient):
    payload = {
        "report": {
            "id": "rpt1",
            "name": "Monthly Summary",
            "filters": {},
        }
    }
    await client.post("/api/reports", json=payload)

    response = await client.get("/api/reports")
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == "rpt1"
    assert data[0]["name"] == "Monthly Summary"
    # Verify camelCase keys
    assert "createdAt" in data[0]
    assert "lastModified" in data[0]
    assert "filters" in data[0]


@pytest.mark.asyncio
async def test_upsert_report(client: AsyncClient):
    payload = {"report": {"id": "rpt1", "name": "V1", "filters": {}}}
    await client.post("/api/reports", json=payload)

    payload = {"report": {"id": "rpt1", "name": "V2", "filters": {"key": "val"}}}
    await client.post("/api/reports", json=payload)

    response = await client.get("/api/reports")
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "V2"


@pytest.mark.asyncio
async def test_delete_report(client: AsyncClient):
    payload = {"report": {"id": "rpt1", "name": "X", "filters": {}}}
    await client.post("/api/reports", json=payload)

    response = await client.delete("/api/reports/rpt1")
    assert response.status_code == 200
    assert response.json()["success"] is True

    response = await client.get("/api/reports")
    assert response.json() == []


@pytest.mark.asyncio
async def test_report_data_post_stub(client: AsyncClient):
    response = await client.post("/api/reports/rpt1/data", json={})
    assert response.status_code == 200
    assert response.json()["success"] is True


@pytest.mark.asyncio
async def test_report_data_get_stub(client: AsyncClient):
    response = await client.get("/api/reports/rpt1/data")
    assert response.status_code == 404
