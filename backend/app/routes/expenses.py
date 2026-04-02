from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.transaction import Transaction
from app.schemas.transaction import TransactionOut
from app.utils.query_builder import build_expenses_filter

router = APIRouter(prefix="/api", tags=["expenses"])


def _parse_list(value: str | None) -> list[str] | None:
    """Parse comma-separated query param into list."""
    if not value:
        return None
    return [s.strip() for s in value.split(",") if s.strip()]


@router.get("/expenses")
async def get_expenses(
    limit: int | None = Query(None),
    offset: int = Query(0),
    dateFrom: str | None = Query(None),
    dateTo: str | None = Query(None),
    userId: str | None = Query(None),
    categories: str | None = Query(None),
    types: str | None = Query(None),
    labels: str | None = Query(None),
    sources: str | None = Query(None),
    minAmount: str | None = Query(None),
    maxAmount: str | None = Query(None),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    filter_params = {
        "dateFrom": dateFrom,
        "dateTo": dateTo,
        "userId": userId,
        "categories": _parse_list(categories),
        "types": _parse_list(types),
        "labels": _parse_list(labels),
        "sources": _parse_list(sources),
        "minAmount": minAmount,
        "maxAmount": maxAmount,
        "search": search,
    }
    filters = build_expenses_filter(filter_params)
    base_stmt = select(Transaction).where(*filters) if filters else select(Transaction)
    order = base_stmt.order_by(Transaction.date.desc())

    if limit is not None and limit >= 0:
        count_stmt = select(func.count()).select_from(base_stmt.subquery())
        total = (await db.execute(count_stmt)).scalar()

        result = await db.execute(order.limit(limit).offset(offset))
        expenses = [
            TransactionOut.from_orm_model(t).model_dump()
            for t in result.scalars().all()
        ]
        return {"expenses": expenses, "total": total}

    result = await db.execute(order)
    return [
        TransactionOut.from_orm_model(t).model_dump() for t in result.scalars().all()
    ]
