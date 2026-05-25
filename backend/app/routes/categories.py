from fastapi import APIRouter, Depends
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_household_id
from app.models.category import Category
from app.schemas.category import CategoriesSaveRequest

router = APIRouter(prefix="/api", tags=["categories"])

DEFAULT_CATEGORIES = [
    "Food & Drink",
    "Shopping",
    "Travel",
    "Health & Wellness",
    "Groceries",
    "Bills & Utilities",
    "Entertainment",
    "Personal",
    "Professional Services",
    "Uncategorized",
]


@router.get("/categories")
async def get_categories(
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Category.name)
        .where(Category.household_id == household_id)
        .order_by(Category.name)
    )
    categories = [row[0] for row in result.all()]
    if not categories:
        categories = DEFAULT_CATEGORIES
    return {"categories": categories}


@router.post("/categories")
async def save_categories(
    body: CategoriesSaveRequest,
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(delete(Category).where(Category.household_id == household_id))
    for name in body.categories:
        # id is just the name (matches the migration's surrogate-id backfill)
        await db.execute(
            text(
                "INSERT INTO categories (id, name, household_id) "
                "VALUES (:id, :name, :hid) "
                "ON CONFLICT (household_id, name) DO NOTHING"
            ),
            {"id": name, "name": name, "hid": household_id},
        )
    await db.commit()
    return {"success": True, "count": len(body.categories)}


@router.get("/labels")
async def get_labels(
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("""
            SELECT DISTINCT lbl
            FROM transactions,
                jsonb_array_elements_text(
                    COALESCE(labels, '[]'::jsonb)
                ) AS lbl
            WHERE transactions.household_id = :hid
            ORDER BY lbl
        """),
        {"hid": household_id},
    )
    labels = [row[0] for row in result.all()]
    return {"labels": labels}
