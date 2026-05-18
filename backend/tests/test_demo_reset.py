import pytest


@pytest.mark.asyncio
async def test_reset_refuses_when_demo_mode_off():
    from app.config import settings
    from app.demo import reset as reset_mod

    original = settings.finance_manager_demo_mode
    settings.finance_manager_demo_mode = False
    try:
        with pytest.raises(SystemExit) as excinfo:
            await reset_mod.reset_demo()
        assert excinfo.value.code != 0
    finally:
        settings.finance_manager_demo_mode = original
