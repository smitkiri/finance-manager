from datetime import date as date_type
from decimal import Decimal

from fastapi import APIRouter, BackgroundTasks, Body, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy import case, delete, func, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.demo.limits import assert_demo_not_mass_delete, assert_demo_replace_count
from app.dependencies.auth import get_current_household_id
from app.models.metadata import Metadata
from app.models.transaction import Transaction
from app.schemas.transaction import (
    ExpenseBulkSaveRequest,
    TransactionOut,
    TransactionUpdate,
)
from app.utils.query_builder import build_expenses_filter, build_stats_filter
from app.utils.subscription_signature import normalize_signature
from app.utils.subscription_utils import reconcile_signature_bg, run_detection_bg

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
    household_id: str = Depends(get_current_household_id),
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
    filters = [Transaction.household_id == household_id] + build_expenses_filter(
        filter_params
    )
    base_stmt = select(Transaction).where(*filters)
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
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    filters = [Transaction.household_id == household_id] + build_stats_filter(
        dateFrom, dateTo, userId
    )
    base = (
        select(
            Transaction.id,
            Transaction.date,
            Transaction.type,
            Transaction.amount,
            Transaction.category,
            Transaction.description,
            Transaction.created_by_user_id,
            Transaction.household_id,
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
                base.c.created_by_user_id,
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
            "user": r.created_by_user_id or "",
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
                base.c.created_by_user_id,
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
            "user": r.created_by_user_id or "",
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


@router.patch("/expenses/{expense_id}")
async def update_expense(
    expense_id: str,
    bg: BackgroundTasks,
    body: TransactionUpdate = Body(...),
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Transaction).where(
            Transaction.id == expense_id, Transaction.household_id == household_id
        )
    )
    txn = result.scalar_one_or_none()
    if not txn:
        return JSONResponse(status_code=404, content={"error": "Transaction not found"})

    old_description = txn.description

    updated = False
    if body.date is not None:
        txn.date = body.date
        updated = True
    if body.description is not None:
        txn.description = body.description
        updated = True
    if body.category is not None:
        txn.category = body.category
        updated = True
    if body.amount is not None:
        txn.amount = Decimal(str(body.amount))
        updated = True
    if body.type is not None:
        txn.type = body.type
        updated = True
    if body.user is not None:
        txn.created_by_user_id = body.user
        updated = True
    if body.labels is not None:
        txn.labels = body.labels
        updated = True
    if body.excludedFromCalculations is not None:
        txn.excluded_from_calculations = body.excludedFromCalculations
        updated = True
    if body.transferInfo is not None:
        txn.transfer_info = body.transferInfo
        updated = True

    if not updated:
        return JSONResponse(status_code=400, content={"error": "No fields to update"})

    await db.commit()
    await db.refresh(txn)

    old_sig = normalize_signature(old_description)
    new_sig = normalize_signature(txn.description)
    bg.add_task(reconcile_signature_bg, household_id, new_sig)
    if old_sig and old_sig != new_sig:
        bg.add_task(reconcile_signature_bg, household_id, old_sig)

    return TransactionOut.from_orm_model(txn).model_dump()


@router.post("/expenses")
async def bulk_save_expenses(
    body: ExpenseBulkSaveRequest,
    bg: BackgroundTasks,
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    assert_demo_replace_count(
        len(body.expenses),
        cap=settings.demo_max_transactions,
        entity="transactions",
    )
    await assert_demo_not_mass_delete(db, Transaction, household_id, len(body.expenses))

    # Delete existing transactions for this household only.
    await db.execute(
        delete(Transaction).where(Transaction.household_id == household_id)
    )

    # Insert new transactions, attached to the requested household.
    for exp in body.expenses:
        txn = Transaction(
            id=exp.id,
            date=date_type.fromisoformat(str(exp.date)[:10]),
            description=exp.description,
            category=exp.category or "Uncategorized",
            amount=exp.amount,
            type=exp.type,
            household_id=household_id,
            created_by_user_id=exp.user,
            labels=exp.labels or [],
            metadata_=exp.metadata or {},
            transfer_info=exp.transferInfo,
            excluded_from_calculations=exp.excludedFromCalculations or False,
        )
        db.add(txn)

    # Store metadata if provided
    if body.metadata:
        stmt = (
            insert(Metadata)
            .values(key="storage_metadata", value=body.metadata)
            .on_conflict_do_update(
                index_elements=[Metadata.key],
                set_={"value": body.metadata},
            )
        )
        await db.execute(stmt)

    await db.commit()
    bg.add_task(run_detection_bg, household_id)

    return {"success": True, "count": len(body.expenses)}
