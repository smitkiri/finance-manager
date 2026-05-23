from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Household
from app.schemas.household import HouseholdOut

router = APIRouter(prefix="/api", tags=["households"])


@router.get("/households", response_model=list[HouseholdOut])
async def list_households(db: AsyncSession = Depends(get_db)) -> list[HouseholdOut]:
    """List all households.

    Phase A1 (no auth): returns every household — typically the seeded default.
    Phase A2+: will filter by the authenticated user's membership.
    """
    result = await db.execute(select(Household).order_by(Household.created_at))
    return [HouseholdOut.from_orm_model(h) for h in result.scalars().all()]
