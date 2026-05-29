import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_demo_config_disabled(client: AsyncClient):
    """When demo mode is not enabled, returns enabled=false."""
    response = await client.get("/api/demo/config")
    assert response.status_code == 200
    assert response.json() == {"enabled": False}


@pytest.mark.asyncio
async def test_demo_config_enabled(client: AsyncClient):
    """When demo mode is enabled, returns enabled=true."""
    from app.config import settings

    original = settings.finance_manager_demo_mode
    settings.finance_manager_demo_mode = True
    try:
        response = await client.get("/api/demo/config")
        assert response.status_code == 200
        assert response.json() == {"enabled": True}
    finally:
        settings.finance_manager_demo_mode = original


@pytest.mark.asyncio
async def test_delete_all_refused_in_demo_mode(
    client: AsyncClient, demo_mode_with_default_user
):
    """DELETE /api/delete-all must 503 in demo mode. Demo disables auth, so
    this endpoint would otherwise let anonymous internet visitors wipe the
    demo household between resets."""
    response = await client.delete("/api/delete-all")
    assert response.status_code == 503
    assert "demo" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_bulk_save_expenses_blocks_wipe_in_demo_mode(
    client, demo_mode_with_default_user, db_session
):
    """Bulk-replace POST /api/expenses must refuse a mass-delete pattern
    in demo mode. The frontend uses bulk-save for add-one (N→N+1) and
    delete-one (N→N-1) flows, so those must still succeed; only larger
    reductions (e.g. expenses=[] when N existing rows exist) are blocked."""
    from datetime import date
    from decimal import Decimal

    from app.models.transaction import Transaction

    # Seed 3 transactions in the demo household.
    for i in range(3):
        db_session.add(
            Transaction(
                id=f"t{i}",
                date=date(2026, 1, 1),
                description="seed",
                category="Food",
                amount=Decimal("1"),
                type="expense",
                created_by_user_id="default-user",
            )
        )
    await db_session.flush()

    # Wipe attempt: 3 existing, posting 0 new → reject.
    response = await client.post("/api/expenses", json={"expenses": []})
    assert response.status_code == 403, response.json()
    assert "demo" in response.json()["detail"].lower()


TELLER_MUTATE_ROUTES = [
    (
        "post",
        "/api/teller/enroll",
        {
            "accessToken": "x",
            "userId": "u",
            "enrollmentId": "e",
            "institutionName": "i",
            "selectedAccounts": [],
        },
    ),
    ("post", "/api/teller/disconnect", {"enrollmentId": "e"}),
    ("put", "/api/teller/enrollment/e/token", {"accessToken": "x"}),
    ("put", "/api/teller/category-mappings", {"mappings": []}),
    (
        "post",
        "/api/teller/enrollments/e/manage-accounts",
        {"userId": "u", "toAdd": [], "toRemove": []},
    ),
    (
        "post",
        "/api/teller/import-transactions",
        {"previewToken": "x", "userMappings": {}},
    ),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("method,path,body", TELLER_MUTATE_ROUTES)
async def test_teller_mutate_refused_in_demo_mode(
    client, demo_mode_with_default_user, method: str, path: str, body: dict
):
    """Teller mutation endpoints (enroll, disconnect, token updates, category
    mapping writes, account add/remove, transaction imports) must 503 in
    demo mode. These touch bank credentials and shouldn't be callable by
    anonymous demo visitors even if Teller is disabled in the deploy."""
    response = await getattr(client, method)(path, json=body)
    assert response.status_code == 503, (
        f"{method.upper()} {path} -> {response.status_code} (expected 503); "
        f"body={response.text}"
    )


@pytest.mark.asyncio
async def test_bulk_save_expenses_allows_delete_one_in_demo_mode(
    client, demo_mode_with_default_user, db_session
):
    """N→N-1 (single delete) must succeed in demo mode."""
    from datetime import date
    from decimal import Decimal

    from app.models.transaction import Transaction

    for i in range(3):
        db_session.add(
            Transaction(
                id=f"t{i}",
                date=date(2026, 1, 1),
                description="seed",
                category="Food",
                amount=Decimal("1"),
                type="expense",
                created_by_user_id="default-user",
            )
        )
    await db_session.flush()

    # Submit 2 (one fewer than the 3 existing) — should succeed.
    response = await client.post(
        "/api/expenses",
        json={
            "expenses": [
                {
                    "id": f"t{i}",
                    "date": "2026-01-01",
                    "description": "seed",
                    "category": "Food",
                    "amount": "1",
                    "type": "expense",
                    "user": "default-user",
                }
                for i in range(2)
            ]
        },
    )
    assert response.status_code == 200, response.json()
