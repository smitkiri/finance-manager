from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_household_id
from app.models.household import Household
from app.schemas.everyday_categories import EverydayCategoriesRequest

router = APIRouter(prefix="/api", tags=["everyday-categories"])


@router.get("/everyday-categories")
async def get_everyday_categories(
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    household = await db.get(Household, household_id)
    return {"categories": list(household.everyday_categories) if household else []}


@router.put("/everyday-categories")
async def save_everyday_categories(
    body: EverydayCategoriesRequest,
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    household = await db.get(Household, household_id)
    if household is None:
        raise HTTPException(status_code=404, detail="Household not found")
    categories = list(dict.fromkeys(body.categories))
    # Assign a fresh list so SQLAlchemy detects the JSONB change
    household.everyday_categories = categories
    await db.commit()
    return {"categories": categories}
