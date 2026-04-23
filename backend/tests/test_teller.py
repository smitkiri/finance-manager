from app.config import Settings


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
