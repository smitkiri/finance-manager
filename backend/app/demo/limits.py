"""Demo mode resource limit helpers.

All helpers are no-ops when settings.finance_manager_demo_mode is False, so
call sites stay clean (no `if demo:` branches).

Limits are configurable on Settings (see app/config.py): demo_max_csv_bytes,
demo_max_transactions, demo_max_per_entity.
"""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings


def assert_demo_csv_size(csv_text: str) -> None:
    if not settings.finance_manager_demo_mode:
        return
    size = len(csv_text.encode("utf-8"))
    if size > settings.demo_max_csv_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=(
                f"Demo limit: CSV must be under "
                f"{settings.demo_max_csv_bytes // 1024} KB. "
                f"Demo data resets daily."
            ),
        )


def assert_demo_replace_count(new_count: int, *, cap: int, entity: str) -> None:
    """Check that a bulk delete-and-reinsert won't exceed the cap.

    Used by endpoints that wipe the household's rows for an entity and
    reinsert a new set (e.g. POST /api/expenses, /api/categories, the CSV
    import endpoints). No DB query needed — the old rows are about to be
    deleted.
    """
    if not settings.finance_manager_demo_mode:
        return
    if new_count > cap:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(f"Demo limit reached: max {cap} {entity}. Demo data resets daily."),
        )


def _count_for_household(model, household_id: str):
    """Build the `select count()` statement for a model, joining if needed."""
    # Local imports to avoid a top-level circular import with app.models.
    from app.models import Account, AccountBalance, Dashboard, DashboardPanel

    if model is DashboardPanel:
        return (
            select(func.count())
            .select_from(DashboardPanel)
            .join(Dashboard, Dashboard.id == DashboardPanel.dashboard_id)
            .where(Dashboard.household_id == household_id)
        )
    if model is AccountBalance:
        return (
            select(func.count())
            .select_from(AccountBalance)
            .join(Account, Account.id == AccountBalance.account_id)
            .where(Account.household_id == household_id)
        )
    return (
        select(func.count())
        .select_from(model)
        .where(model.household_id == household_id)
    )


async def assert_demo_can_add_entity(
    db: AsyncSession, model, household_id: str
) -> None:
    """Check that adding one more row to `model` for this household stays
    under demo_max_per_entity. No-op when demo mode is off."""
    if not settings.finance_manager_demo_mode:
        return
    stmt = _count_for_household(model, household_id)
    current = (await db.execute(stmt)).scalar_one()
    if current + 1 > settings.demo_max_per_entity:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Demo limit reached: max {settings.demo_max_per_entity} "
                f"{model.__tablename__}. Demo data resets daily."
            ),
        )


def refuse_in_demo_mode() -> None:
    """Raise 503 if demo mode is on. Used by endpoints that should be
    entirely disabled (e.g. /restore)."""
    if not settings.finance_manager_demo_mode:
        return
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="This feature isn't available in demo mode",
    )
