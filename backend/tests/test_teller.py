from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.config import Settings
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
