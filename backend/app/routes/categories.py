from fastapi import APIRouter, Depends
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.demo.limits import assert_demo_replace_count
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


async def household_category_names(db: AsyncSession, household_id: str) -> list[str]:
    """The household's category list, falling back to the built-in defaults."""
    result = await db.execute(
        select(Category.name)
        .where(Category.household_id == household_id)
        .order_by(Category.name)
    )
    return [row[0] for row in result.all()] or DEFAULT_CATEGORIES


@router.get("/categories")
async def get_categories(
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    return {"categories": await household_category_names(db, household_id)}


@router.post("/categories")
async def save_categories(
    body: CategoriesSaveRequest,
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    assert_demo_replace_count(
        len(body.categories),
        cap=settings.demo_max_per_entity,
        entity="categories",
    )
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
