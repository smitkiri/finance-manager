import time
from datetime import date as date_type
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.models.account import Account
from app.models.metadata import Metadata
from app.models.transaction import Transaction
from app.models.user import User
from app.routes.teller import _import_preview_cache
from app.utils.teller_client import TellerClient


def test_teller_disabled_by_default():
    s = Settings()
    assert s.is_teller_enabled is False


def test_teller_enabled_when_all_set():
    s = Settings(
        finance_manager_teller_integration_enabled=True,
        finance_manager_teller_app_id="test-app-id",
        finance_manager_teller_private_key="/tmp/key.pem",
        finance_manager_teller_cert="/tmp/cert.pem",
    )
    assert s.is_teller_enabled is True


def test_teller_disabled_when_partial():
    s = Settings(
        finance_manager_teller_integration_enabled=True,
        finance_manager_teller_app_id="test-app-id",
    )
    assert s.is_teller_enabled is False


@pytest.mark.asyncio
async def test_teller_client_request_success():
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = [{"id": "acc_123", "name": "Checking"}]

    with patch("app.utils.teller_client.httpx.AsyncClient") as MockClient:
        mock_client_instance = AsyncMock()
        mock_client_instance.get.return_value = mock_response
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = mock_client_instance

        client = TellerClient(cert_path="/tmp/cert.pem", key_path="/tmp/key.pem")
        status, data = await client.request("/accounts", "test-token")

        assert status == 200
        assert data == [{"id": "acc_123", "name": "Checking"}]
        mock_client_instance.get.assert_called_once()


@pytest.mark.asyncio
async def test_teller_client_non_json_response():
    mock_response = MagicMock()
    mock_response.status_code = 500
    mock_response.json.side_effect = ValueError("not json")
    mock_response.text = "Internal Server Error"

    with patch("app.utils.teller_client.httpx.AsyncClient") as MockClient:
        mock_client_instance = AsyncMock()
        mock_client_instance.get.return_value = mock_response
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = mock_client_instance

        client = TellerClient(cert_path="/tmp/cert.pem", key_path="/tmp/key.pem")
        status, data = await client.request("/accounts", "test-token")

        assert status == 500
        assert data == "Internal Server Error"


# --- Route tests ---


@pytest.mark.asyncio
async def test_teller_config_disabled(client: AsyncClient):
    """When teller is not enabled, returns enabled=false."""
    response = await client.get("/api/teller/config")
    assert response.status_code == 200
    data = response.json()
    assert data["enabled"] is False
    assert data["enrollments"] == []


@pytest.mark.asyncio
async def test_teller_config_enabled(client: AsyncClient, db_session: AsyncSession):
    """When teller is enabled with enrollments stored, returns them."""
    from app.config import settings

    original = (
        settings.finance_manager_teller_integration_enabled,
        settings.finance_manager_teller_app_id,
        settings.finance_manager_teller_private_key,
        settings.finance_manager_teller_cert,
    )
    settings.finance_manager_teller_integration_enabled = True
    settings.finance_manager_teller_app_id = "test-app-id"
    settings.finance_manager_teller_private_key = "/tmp/key.pem"
    settings.finance_manager_teller_cert = "/tmp/cert.pem"

    try:
        enrollments = [
            {
                "accessToken": "token-1",
                "userId": "u1",
                "enrollmentId": "enr_1",
                "institutionName": "Test Bank",
                "connectedAt": "2026-01-01T00:00:00Z",
            }
        ]
        db_session.add(Metadata(key="teller_enrollments", value=enrollments))
        await db_session.flush()

        response = await client.get("/api/teller/config")
        assert response.status_code == 200
        data = response.json()
        assert data["enabled"] is True
        assert data["applicationId"] == "test-app-id"
        assert len(data["enrollments"]) == 1
        assert data["enrollments"][0]["enrollmentId"] == "enr_1"
        assert data["enrollments"][0]["institutionName"] == "Test Bank"
        # accessToken should NOT be in the response
        assert "accessToken" not in data["enrollments"][0]
    finally:
        (
            settings.finance_manager_teller_integration_enabled,
            settings.finance_manager_teller_app_id,
            settings.finance_manager_teller_private_key,
            settings.finance_manager_teller_cert,
        ) = original


@pytest.mark.asyncio
async def test_enrollment_token_not_found(
    client: AsyncClient, db_session: AsyncSession
):
    db_session.add(Metadata(key="teller_enrollments", value=[]))
    await db_session.flush()

    response = await client.get("/api/teller/enrollment-token/enr_missing")
    # Teller not enabled → 400
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_update_token_not_found(client: AsyncClient, db_session: AsyncSession):
    response = await client.put(
        "/api/teller/enrollment/enr_missing/token",
        json={"accessToken": "new-token"},
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_preview_accounts_disabled(client: AsyncClient):
    response = await client.post(
        "/api/teller/preview-accounts", json={"accessToken": "tok"}
    )
    assert response.status_code == 400
    assert response.json()["error"] == "Teller integration not enabled"


@pytest.mark.asyncio
async def test_enroll_creates_accounts(client: AsyncClient, db_session: AsyncSession):
    """Enroll should save enrollment and create account records."""
    db_session.add(User(id="u1", name="Test User"))
    await db_session.flush()

    db_session.add(Metadata(key="teller_enrollments", value=[]))
    await db_session.flush()

    response = await client.post(
        "/api/teller/enroll",
        json={
            "accessToken": "tok-123",
            "userId": "u1",
            "enrollmentId": "enr_1",
            "institutionName": "Test Bank",
            "selectedAccounts": [
                {
                    "tellerAccountId": "tel_acc_1",
                    "alias": "My Checking",
                    "accountType": "asset",
                }
            ],
        },
    )
    assert response.status_code == 200
    assert response.json()["success"] is True

    # Verify enrollment was saved
    result = await db_session.execute(
        select(Metadata).where(Metadata.key == "teller_enrollments")
    )
    meta = result.scalar_one()
    assert len(meta.value) == 1
    assert meta.value[0]["enrollmentId"] == "enr_1"

    # Verify account was created
    result = await db_session.execute(
        select(Account).where(Account.teller_account_id == "tel_acc_1")
    )
    account = result.scalar_one()
    assert account.name == "My Checking"
    assert account.user_id == "u1"


@pytest.mark.asyncio
async def test_disconnect_removes_enrollment_and_accounts(
    client: AsyncClient, db_session: AsyncSession
):
    db_session.add(User(id="u1", name="Test User"))
    enrollment = {
        "accessToken": "tok",
        "userId": "u1",
        "enrollmentId": "enr_1",
        "institutionName": "Test Bank",
        "connectedAt": "2026-01-01T00:00:00Z",
    }
    db_session.add(Metadata(key="teller_enrollments", value=[enrollment]))
    db_session.add(
        Account(
            id="a1",
            user_id="u1",
            name="Checking",
            type="asset",
            teller_account_id="tel_1",
            teller_enrollment_id="enr_1",
        )
    )
    await db_session.flush()

    response = await client.post(
        "/api/teller/disconnect", json={"enrollmentId": "enr_1"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["accountsDeleted"] == 1

    # Verify enrollment removed
    result = await db_session.execute(
        select(Metadata).where(Metadata.key == "teller_enrollments")
    )
    meta = result.scalar_one()
    assert len(meta.value) == 0


@pytest.mark.asyncio
async def test_enrollment_preview_accounts_not_found(
    client: AsyncClient, db_session: AsyncSession
):
    db_session.add(Metadata(key="teller_enrollments", value=[]))
    await db_session.flush()

    response = await client.get("/api/teller/enrollments/enr_missing/preview-accounts")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_manage_accounts_add(client: AsyncClient, db_session: AsyncSession):
    db_session.add(User(id="u1", name="Test User"))
    enrollment = {
        "accessToken": "tok",
        "userId": "u1",
        "enrollmentId": "enr_1",
        "institutionName": "Test Bank",
        "connectedAt": "2026-01-01T00:00:00Z",
    }
    db_session.add(Metadata(key="teller_enrollments", value=[enrollment]))
    await db_session.flush()

    response = await client.post(
        "/api/teller/enrollments/enr_1/manage-accounts",
        json={
            "toAdd": [
                {
                    "tellerAccountId": "tel_1",
                    "alias": "New Checking",
                    "accountType": "asset",
                }
            ],
            "toRemove": [],
            "userId": "u1",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["added"] == 1
    assert data["removed"] == 0


@pytest.mark.asyncio
async def test_refresh_balances_no_enrollment(
    client: AsyncClient, db_session: AsyncSession
):
    db_session.add(Metadata(key="teller_enrollments", value=[]))
    await db_session.flush()

    response = await client.post("/api/teller/refresh-balances")
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_get_category_mappings_empty(client: AsyncClient):
    response = await client.get("/api/teller/category-mappings")
    assert response.status_code == 200
    assert response.json()["mappings"] == []


@pytest.mark.asyncio
async def test_put_category_mappings_updates_transactions(
    client: AsyncClient, db_session: AsyncSession
):
    # Create a transaction with a teller category in metadata
    db_session.add(
        Transaction(
            id="t1",
            date=date_type(2026, 1, 15),
            description="Coffee Shop",
            category="food_and_drink",
            amount=Decimal("5.50"),
            type="expense",
            user_id="u1",
            metadata_={
                "teller": {"details": {"category": "food_and_drink"}},
                "tellerTransactionId": "teller_tx_1",
            },
        )
    )
    await db_session.flush()

    response = await client.put(
        "/api/teller/category-mappings",
        json={
            "mappings": [{"tellerCategory": "food_and_drink", "userCategory": "Dining"}]
        },
    )
    assert response.status_code == 200
    assert response.json()["success"] is True

    # Verify the transaction was re-categorized
    result = await db_session.execute(select(Transaction).where(Transaction.id == "t1"))
    txn = result.scalar_one()
    assert txn.category == "Dining"


@pytest.mark.asyncio
async def test_get_category_mappings_with_counts(
    client: AsyncClient, db_session: AsyncSession
):
    # Save a mapping
    db_session.add(
        Metadata(
            key="teller_category_mappings",
            value={"food_and_drink": "Dining"},
        )
    )
    # Create a transaction with that teller category
    db_session.add(
        Transaction(
            id="t1",
            date=date_type(2026, 1, 15),
            description="Coffee",
            category="Dining",
            amount=Decimal("5.00"),
            type="expense",
            user_id="u1",
            metadata_={
                "teller": {"details": {"category": "food_and_drink"}},
                "tellerTransactionId": "teller_tx_1",
            },
        )
    )
    await db_session.flush()

    response = await client.get("/api/teller/category-mappings")
    assert response.status_code == 200
    data = response.json()
    assert len(data["mappings"]) == 1
    assert data["mappings"][0]["tellerCategory"] == "food_and_drink"
    assert data["mappings"][0]["userCategory"] == "Dining"
    assert data["mappings"][0]["transactionCount"] == 1


# --- Preview-Import and Import-Transactions tests ---


@pytest.mark.asyncio
async def test_preview_import_disabled(client: AsyncClient):
    response = await client.post(
        "/api/teller/preview-import",
        json={
            "accountIds": ["a1"],
            "startDate": "2026-01-01",
            "endDate": "2026-01-31",
        },
    )
    assert response.status_code == 400
    assert response.json()["error"] == "Teller integration not enabled"


@pytest.mark.asyncio
async def test_preview_import_validation(client: AsyncClient, db_session: AsyncSession):
    from app.config import settings

    original = (
        settings.finance_manager_teller_integration_enabled,
        settings.finance_manager_teller_app_id,
        settings.finance_manager_teller_private_key,
        settings.finance_manager_teller_cert,
    )
    settings.finance_manager_teller_integration_enabled = True
    settings.finance_manager_teller_app_id = "test-app-id"
    settings.finance_manager_teller_private_key = "/tmp/key.pem"
    settings.finance_manager_teller_cert = "/tmp/cert.pem"

    try:
        # Missing accountIds
        response = await client.post(
            "/api/teller/preview-import",
            json={
                "accountIds": [],
                "startDate": "2026-01-01",
                "endDate": "2026-01-31",
            },
        )
        assert response.status_code == 400

        # startDate > endDate
        response = await client.post(
            "/api/teller/preview-import",
            json={
                "accountIds": ["a1"],
                "startDate": "2026-02-01",
                "endDate": "2026-01-01",
            },
        )
        assert response.status_code == 400
    finally:
        (
            settings.finance_manager_teller_integration_enabled,
            settings.finance_manager_teller_app_id,
            settings.finance_manager_teller_private_key,
            settings.finance_manager_teller_cert,
        ) = original


@pytest.mark.asyncio
async def test_import_transactions_expired_preview(client: AsyncClient):
    response = await client.post(
        "/api/teller/import-transactions",
        json={"previewToken": "nonexistent"},
    )
    assert response.status_code == 400
    assert (
        "expired" in response.json()["error"].lower()
        or "not found" in response.json()["error"].lower()
    )


@pytest.mark.asyncio
async def test_import_transactions_from_cache(
    client: AsyncClient, db_session: AsyncSession
):
    """Seed the preview cache directly and confirm import works."""
    db_session.add(User(id="u1", name="Test User"))
    await db_session.flush()

    preview_token = "test-preview-token"
    _import_preview_cache[preview_token] = {
        "accounts": [
            {
                "accountId": "a1",
                "accountName": "Checking",
                "accountType": "asset",
                "userId": "u1",
                "tellerAccountId": "tel_1",
                "newTransactions": [
                    {
                        "id": "teller_tx_1",
                        "date": "2026-01-15",
                        "description": "Coffee Shop",
                        "amount": "-5.50",
                        "type": "debit",
                        "status": "posted",
                        "details": {
                            "category": "food_and_drink",
                            "counterparty": {"name": "Starbucks"},
                        },
                    }
                ],
                "newCount": 1,
                "duplicateCount": 0,
            }
        ],
        "category_map": {"teller_tx_1": "Dining"},
        "expires_at": time.time() + 600,
    }

    response = await client.post(
        "/api/teller/import-transactions",
        json={"previewToken": preview_token, "userMappings": {}},
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["sessions"]) == 1
    assert data["sessions"][0]["added"] == 1

    # Verify transaction was created in DB
    result = await db_session.execute(
        select(Transaction).where(
            Transaction.metadata_["tellerTransactionId"].as_string() == "teller_tx_1"
        )
    )
    txn = result.scalar_one()
    assert txn.description == "Coffee Shop"
    assert txn.category == "Dining"
    assert float(txn.amount) == 5.50

    # Cache should be cleared
    assert preview_token not in _import_preview_cache
