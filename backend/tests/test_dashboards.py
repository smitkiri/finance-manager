from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dashboard import Dashboard, DashboardPanel


@pytest.mark.asyncio
async def test_list_dashboards_empty(client: AsyncClient):
    response = await client.get("/api/dashboards")
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_create_dashboard(client: AsyncClient):
    response = await client.post(
        "/api/dashboards",
        json={
            "id": "d1",
            "name": "Main Dashboard",
            "isDefault": True,
            "dateRangeStart": "2024-01-01",
            "dateRangeEnd": "2024-12-31",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["id"] == "d1"
    assert data["name"] == "Main Dashboard"
    assert data["isDefault"] is True


@pytest.mark.asyncio
async def test_create_dashboard_clears_other_defaults(
    client: AsyncClient, db_session: AsyncSession
):
    db_session.add(
        Dashboard(
            id="d1",
            name="First",
            is_default=True,
            date_range_start=date(2024, 1, 1),
            date_range_end=date(2024, 12, 31),
        )
    )
    await db_session.flush()

    response = await client.post(
        "/api/dashboards",
        json={
            "id": "d2",
            "name": "Second",
            "isDefault": True,
            "dateRangeStart": "2024-01-01",
            "dateRangeEnd": "2024-12-31",
        },
    )
    assert response.status_code == 201

    # List and check only d2 is default
    response = await client.get("/api/dashboards")
    data = response.json()
    defaults = [d for d in data if d["isDefault"]]
    assert len(defaults) == 1
    assert defaults[0]["id"] == "d2"


@pytest.mark.asyncio
async def test_list_dashboards_with_panel_count(
    client: AsyncClient, db_session: AsyncSession
):
    db_session.add(
        Dashboard(
            id="d1",
            name="Test",
            is_default=False,
            date_range_start=date(2024, 1, 1),
            date_range_end=date(2024, 12, 31),
        )
    )
    await db_session.flush()
    db_session.add(
        DashboardPanel(
            id="p1",
            dashboard_id="d1",
            title="Panel 1",
            chart_type="bar",
        )
    )
    await db_session.flush()

    response = await client.get("/api/dashboards")
    data = response.json()
    assert data[0]["panelCount"] == 1


@pytest.mark.asyncio
async def test_update_dashboard(client: AsyncClient, db_session: AsyncSession):
    db_session.add(
        Dashboard(
            id="d1",
            name="Old",
            is_default=False,
            date_range_start=date(2024, 1, 1),
            date_range_end=date(2024, 12, 31),
        )
    )
    await db_session.flush()

    response = await client.patch(
        "/api/dashboards/d1",
        json={"name": "New"},
    )
    assert response.status_code == 200
    assert response.json()["name"] == "New"


@pytest.mark.asyncio
async def test_update_dashboard_not_found(client: AsyncClient):
    response = await client.patch(
        "/api/dashboards/nonexistent",
        json={"name": "X"},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_update_dashboard_nothing_to_update(
    client: AsyncClient, db_session: AsyncSession
):
    db_session.add(
        Dashboard(
            id="d1",
            name="Test",
            is_default=False,
            date_range_start=date(2024, 1, 1),
            date_range_end=date(2024, 12, 31),
        )
    )
    await db_session.flush()

    response = await client.patch("/api/dashboards/d1", json={})
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_delete_dashboard(client: AsyncClient, db_session: AsyncSession):
    db_session.add(
        Dashboard(
            id="d1",
            name="Test",
            is_default=False,
            date_range_start=date(2024, 1, 1),
            date_range_end=date(2024, 12, 31),
        )
    )
    await db_session.flush()

    response = await client.delete("/api/dashboards/d1")
    assert response.status_code == 200
    assert response.json() == {"success": True}


@pytest.mark.asyncio
async def test_list_panels(client: AsyncClient, db_session: AsyncSession):
    db_session.add(
        Dashboard(
            id="d1",
            name="Test",
            is_default=False,
            date_range_start=date(2024, 1, 1),
            date_range_end=date(2024, 12, 31),
        )
    )
    await db_session.flush()
    db_session.add(
        DashboardPanel(
            id="p1",
            dashboard_id="d1",
            title="Panel 1",
            chart_type="bar",
            panel_order=0,
        )
    )
    await db_session.flush()

    response = await client.get("/api/dashboards/d1/panels")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == "p1"
    assert data[0]["title"] == "Panel 1"
    assert data[0]["chartType"] == "bar"
    assert data[0]["dashboardId"] == "d1"


@pytest.mark.asyncio
async def test_create_panel(client: AsyncClient, db_session: AsyncSession):
    db_session.add(
        Dashboard(
            id="d1",
            name="Test",
            is_default=False,
            date_range_start=date(2024, 1, 1),
            date_range_end=date(2024, 12, 31),
        )
    )
    await db_session.flush()

    response = await client.post(
        "/api/dashboards/d1/panels",
        json={
            "id": "p1",
            "title": "Expenses",
            "chartType": "bar",
            "filterGroups": [
                {
                    "conditions": [
                        {
                            "field": "type",
                            "operator": "is",
                            "value": "expense",
                        }
                    ]
                }
            ],
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["id"] == "p1"
    assert data["dashboardId"] == "d1"
    assert data["title"] == "Expenses"
    assert len(data["filterGroups"]) == 1


@pytest.mark.asyncio
async def test_create_panel_enforces_15_limit(
    client: AsyncClient, db_session: AsyncSession
):
    db_session.add(
        Dashboard(
            id="d1",
            name="Test",
            is_default=False,
            date_range_start=date(2024, 1, 1),
            date_range_end=date(2024, 12, 31),
        )
    )
    await db_session.flush()
    for i in range(15):
        db_session.add(
            DashboardPanel(
                id=f"p{i}",
                dashboard_id="d1",
                title=f"Panel {i}",
                chart_type="bar",
            )
        )
    await db_session.flush()

    response = await client.post(
        "/api/dashboards/d1/panels",
        json={
            "id": "p_extra",
            "title": "Extra",
            "chartType": "bar",
        },
    )
    assert response.status_code == 400
    assert "15-panel limit" in response.json()["error"]


@pytest.mark.asyncio
async def test_update_panel(client: AsyncClient, db_session: AsyncSession):
    db_session.add(
        Dashboard(
            id="d1",
            name="Test",
            is_default=False,
            date_range_start=date(2024, 1, 1),
            date_range_end=date(2024, 12, 31),
        )
    )
    await db_session.flush()
    db_session.add(
        DashboardPanel(
            id="p1",
            dashboard_id="d1",
            title="Old",
            chart_type="bar",
        )
    )
    await db_session.flush()

    response = await client.patch(
        "/api/dashboard-panels/p1",
        json={"title": "New Title", "chartType": "line"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "New Title"
    assert data["chartType"] == "line"


@pytest.mark.asyncio
async def test_update_panel_not_found(client: AsyncClient):
    response = await client.patch(
        "/api/dashboard-panels/nonexistent",
        json={"title": "X"},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_update_panel_nothing_to_update(
    client: AsyncClient, db_session: AsyncSession
):
    db_session.add(
        Dashboard(
            id="d1",
            name="Test",
            is_default=False,
            date_range_start=date(2024, 1, 1),
            date_range_end=date(2024, 12, 31),
        )
    )
    await db_session.flush()
    db_session.add(
        DashboardPanel(
            id="p1",
            dashboard_id="d1",
            title="T",
            chart_type="bar",
        )
    )
    await db_session.flush()

    response = await client.patch("/api/dashboard-panels/p1", json={})
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_delete_panel(client: AsyncClient, db_session: AsyncSession):
    db_session.add(
        Dashboard(
            id="d1",
            name="Test",
            is_default=False,
            date_range_start=date(2024, 1, 1),
            date_range_end=date(2024, 12, 31),
        )
    )
    await db_session.flush()
    db_session.add(
        DashboardPanel(
            id="p1",
            dashboard_id="d1",
            title="T",
            chart_type="bar",
        )
    )
    await db_session.flush()

    response = await client.delete("/api/dashboard-panels/p1")
    assert response.status_code == 200
    assert response.json() == {"success": True}


@pytest.mark.asyncio
async def test_reorder_panels(client: AsyncClient, db_session: AsyncSession):
    db_session.add(
        Dashboard(
            id="d1",
            name="Test",
            is_default=False,
            date_range_start=date(2024, 1, 1),
            date_range_end=date(2024, 12, 31),
        )
    )
    await db_session.flush()
    db_session.add(
        DashboardPanel(
            id="p1",
            dashboard_id="d1",
            title="A",
            chart_type="bar",
            panel_order=0,
        )
    )
    db_session.add(
        DashboardPanel(
            id="p2",
            dashboard_id="d1",
            title="B",
            chart_type="bar",
            panel_order=1,
        )
    )
    await db_session.flush()

    response = await client.patch(
        "/api/dashboards/d1/panel-order",
        json={"panelIds": ["p2", "p1"]},
    )
    assert response.status_code == 200

    # Verify new order
    response = await client.get("/api/dashboards/d1/panels")
    data = response.json()
    assert data[0]["id"] == "p2"
    assert data[0]["panelOrder"] == 0
    assert data[1]["id"] == "p1"
    assert data[1]["panelOrder"] == 1
