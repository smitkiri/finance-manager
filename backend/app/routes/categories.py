from fastapi import APIRouter, Depends
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
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
async def get_categories(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Category.name).order_by(Category.name))
    categories = [row[0] for row in result.all()]
    if not categories:
        categories = DEFAULT_CATEGORIES
    return {"categories": categories}


@router.post("/categories")
async def save_categories(
    body: CategoriesSaveRequest, db: AsyncSession = Depends(get_db)
):
    await db.execute(delete(Category))
    for name in body.categories:
        await db.execute(
            text(
                "INSERT INTO categories (name) VALUES (:name)"
                " ON CONFLICT (name) DO NOTHING"
            ),
            {"name": name},
        )
    await db.commit()
    return {"success": True, "count": len(body.categories)}


@router.get("/labels")
async def get_labels(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("""
            SELECT DISTINCT lbl
            FROM transactions,
                jsonb_array_elements_text(
                    COALESCE(labels, '[]'::jsonb)
                ) AS lbl
            ORDER BY lbl
        """)
    )
    labels = [row[0] for row in result.all()]
    return {"labels": labels}
