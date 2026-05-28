from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies.auth import get_current_household_id
from app.models import (
    Account,
    Category,
    Dashboard,
    Household,
    Report,
    Source,
    Transaction,
)
from app.schemas.household import (
    HouseholdOut,
    HouseholdRenameRequest,
    HouseholdSummary,
)

router = APIRouter(prefix="/api", tags=["households"])


@router.get("/households", response_model=list[HouseholdOut])
async def list_households(
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
) -> list[HouseholdOut]:
    """Return the caller's household (single-element list).

    Returned as a list to keep the A1-era client contract working; phase B
    will likely replace with /households/me or fold into /auth/me.
    """
    h = await db.get(Household, household_id)
    return [HouseholdOut.from_orm_model(h)] if h else []


@router.get("/households/me/summary", response_model=HouseholdSummary)
async def household_summary(
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
) -> HouseholdSummary:
    async def _count(model) -> int:
        return (
            await db.execute(
                select(func.count())
                .select_from(model)
                .where(model.household_id == household_id)
            )
        ).scalar_one()

    return HouseholdSummary(
        transactions=await _count(Transaction),
        accounts=await _count(Account),
        categories=await _count(Category),
        sources=await _count(Source),
        dashboards=await _count(Dashboard),
        reports=await _count(Report),
    )


@router.patch("/households/{household_id}", response_model=HouseholdOut)
async def rename_household(
    household_id: str,
    payload: HouseholdRenameRequest,
    current_household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
) -> HouseholdOut:
    if settings.finance_manager_demo_mode:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Disabled in demo mode",
        )
    if household_id != current_household_id:
        raise HTTPException(status_code=404, detail="Household not found")

    await db.execute(
        update(Household).where(Household.id == household_id).values(name=payload.name)
    )
    await db.commit()
    refreshed = (
        await db.execute(select(Household).where(Household.id == household_id))
    ).scalar_one()
    return HouseholdOut.from_orm_model(refreshed)
