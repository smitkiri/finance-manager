from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_household_id
from app.models.source import Source
from app.schemas.source import (
    SourceCreateRequest,
    SourceOut,
    SourceUpdateRequest,
)

router = APIRouter(prefix="/api", tags=["sources"])


async def _get_all_sources(db: AsyncSession, household_id: str) -> list[dict]:
    result = await db.execute(
        select(Source)
        .where(Source.household_id == household_id)
        .order_by(Source.created_at)
    )
    return [SourceOut.from_orm_model(s).model_dump() for s in result.scalars().all()]


@router.get("/sources")
async def get_sources(
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Source)
        .where(Source.household_id == household_id)
        .order_by(Source.created_at)
    )
    return [SourceOut.from_orm_model(s) for s in result.scalars().all()]


@router.post("/sources")
async def create_source(
    body: SourceCreateRequest,
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    src = body.source
    existing = await db.execute(
        select(Source).where(
            Source.household_id == household_id, Source.name == src.name
        )
    )
    if existing.scalar_one_or_none():
        return JSONResponse(
            status_code=400,
            content={"error": "Source name already exists"},
        )

    source = Source(
        id=src.id,
        name=src.name,
        household_id=household_id,
        mappings=src.mappings,
        flip_income_expense=src.flipIncomeExpense,
    )
    db.add(source)
    await db.commit()

    return {"success": True, "sources": await _get_all_sources(db, household_id)}


@router.put("/sources/{source_id}")
async def update_source(
    source_id: str,
    body: SourceUpdateRequest,
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    src = body.source

    result = await db.execute(
        select(Source).where(
            Source.id == source_id, Source.household_id == household_id
        )
    )
    source = result.scalar_one_or_none()
    if not source:
        return JSONResponse(status_code=404, content={"error": "Source not found"})

    # Check name uniqueness within the household (excluding self)
    conflict = await db.execute(
        select(Source).where(
            Source.household_id == household_id,
            Source.name == src.name,
            Source.id != source_id,
        )
    )
    if conflict.scalar_one_or_none():
        return JSONResponse(
            status_code=400,
            content={"error": "Source name already exists"},
        )

    source.name = src.name
    source.mappings = src.mappings
    source.flip_income_expense = src.flipIncomeExpense
    source.last_used = datetime.now(UTC).replace(tzinfo=None)

    await db.commit()

    return {"success": True, "sources": await _get_all_sources(db, household_id)}


@router.delete("/sources/{source_name}")
async def delete_source(
    source_name: str,
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        delete(Source).where(
            Source.household_id == household_id, Source.name == source_name
        )
    )
    await db.commit()

    return {"success": True, "sources": await _get_all_sources(db, household_id)}
