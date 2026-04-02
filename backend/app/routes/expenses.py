from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.transaction import Transaction
from app.schemas.transaction import TransactionOut
from app.utils.query_builder import build_expenses_filter, build_stats_filter

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


@router.get("/stats")
async def get_stats(
    dateFrom: str | None = Query(None),
    dateTo: str | None = Query(None),
    userId: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    filters = build_stats_filter(dateFrom, dateTo, userId)
    base = (
        select(
            Transaction.id,
            Transaction.date,
            Transaction.type,
            Transaction.amount,
            Transaction.category,
            Transaction.description,
            Transaction.user_id,
        )
        .where(*filters)
        .subquery()
    )

    # Totals
    total_row = (
        await db.execute(
            select(
                func.coalesce(
                    func.sum(
                        case(
                            (base.c.type == "expense", func.abs(base.c.amount)),
                            else_=0,
                        )
                    ),
                    0,
                ).label("total_expenses"),
                func.coalesce(
                    func.sum(case((base.c.type == "income", base.c.amount), else_=0)),
                    0,
                ).label("total_income"),
            ).select_from(base)
        )
    ).one()
    total_expenses = float(total_row.total_expenses)
    total_income = float(total_row.total_income)

    # Category breakdown (expenses)
    cat_rows = (
        await db.execute(
            select(
                base.c.category,
                func.coalesce(func.sum(func.abs(base.c.amount)), 0).label("total"),
            )
            .select_from(base)
            .where(base.c.type == "expense")
            .group_by(base.c.category)
        )
    ).all()
    category_breakdown = {
        (row.category or "Uncategorized"): float(row.total) for row in cat_rows
    }

    # Income category breakdown
    income_cat_rows = (
        await db.execute(
            select(
                base.c.category,
                func.coalesce(func.sum(base.c.amount), 0).label("total"),
            )
            .select_from(base)
            .where(base.c.type == "income")
            .group_by(base.c.category)
        )
    ).all()
    income_category_breakdown = {
        (row.category or "Uncategorized"): float(row.total) for row in income_cat_rows
    }

    # Monthly data — use GROUP BY position to avoid duplicate bind params
    monthly_rows = (
        await db.execute(
            select(
                func.to_char(base.c.date, "YYYY-MM").label("iso_month"),
                func.to_char(base.c.date, "Mon YYYY").label("display_month"),
                func.date_trunc("month", base.c.date).label("month_start"),
                func.coalesce(
                    func.sum(
                        case(
                            (base.c.type == "expense", func.abs(base.c.amount)),
                            else_=0,
                        )
                    ),
                    0,
                ).label("expenses"),
                func.coalesce(
                    func.sum(case((base.c.type == "income", base.c.amount), else_=0)),
                    0,
                ).label("income"),
            )
            .select_from(base)
            .group_by(text("1, 2, 3"))
            .order_by(text("month_start"))
        )
    ).all()
    monthly_data = [
        {
            "month": row.display_month,
            "expenses": float(row.expenses),
            "income": float(row.income),
        }
        for row in monthly_rows
    ]
    month_order = [row.display_month for row in monthly_rows]

    # Monthly category data
    monthly_cat_rows = (
        await db.execute(
            select(
                func.to_char(base.c.date, "Mon YYYY").label("display_month"),
                func.date_trunc("month", base.c.date).label("month_start"),
                base.c.category,
                func.coalesce(func.sum(func.abs(base.c.amount)), 0).label("total"),
            )
            .select_from(base)
            .where(base.c.type == "expense")
            .group_by(text("1, 2, 3"))
            .order_by(text("month_start"))
        )
    ).all()
    monthly_cat_map: dict[str, dict] = {}
    for row in monthly_cat_rows:
        key = row.display_month
        if key not in monthly_cat_map:
            monthly_cat_map[key] = {"month": key}
        monthly_cat_map[key][row.category or "Uncategorized"] = float(row.total)
    monthly_category_data = [monthly_cat_map.get(m, {"month": m}) for m in month_order]

    # Top 10 expenses
    top_exp_rows = (
        await db.execute(
            select(
                base.c.id,
                base.c.date,
                base.c.description,
                base.c.category,
                base.c.amount,
                base.c.user_id,
            )
            .select_from(base)
            .where(base.c.type == "expense")
            .order_by(func.abs(base.c.amount).desc())
            .limit(10)
        )
    ).all()
    top_expenses = [
        {
            "id": r.id,
            "date": r.date.isoformat() if hasattr(r.date, "isoformat") else r.date,
            "description": r.description,
            "category": r.category,
            "amount": float(r.amount),
            "type": "expense",
            "user": r.user_id or "",
        }
        for r in top_exp_rows
    ]

    # Top 10 income
    top_inc_rows = (
        await db.execute(
            select(
                base.c.id,
                base.c.date,
                base.c.description,
                base.c.category,
                base.c.amount,
                base.c.user_id,
            )
            .select_from(base)
            .where(base.c.type == "income")
            .order_by(base.c.amount.desc())
            .limit(10)
        )
    ).all()
    top_income = [
        {
            "id": r.id,
            "date": r.date.isoformat() if hasattr(r.date, "isoformat") else r.date,
            "description": r.description,
            "category": r.category,
            "amount": float(r.amount),
            "type": "income",
            "user": r.user_id or "",
        }
        for r in top_inc_rows
    ]

    return {
        "totalExpenses": total_expenses,
        "totalIncome": total_income,
        "netAmount": total_income - total_expenses,
        "categoryBreakdown": category_breakdown,
        "incomeCategoryBreakdown": income_category_breakdown,
        "monthlyData": monthly_data,
        "monthlyCategoryData": monthly_category_data,
        "topExpenses": top_expenses,
        "topIncome": top_income,
    }
