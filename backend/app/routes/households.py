from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_household_id
from app.models import Household
from app.schemas.household import HouseholdOut

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
