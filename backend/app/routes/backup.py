import json
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.account import Account, AccountBalance
from app.models.category import Category
from app.models.date_range import DateRange
from app.models.metadata import Metadata
from app.models.report import Report
from app.models.source import Source
from app.models.transaction import Transaction
from app.models.user import User

router = APIRouter(prefix="/api", tags=["backup"])


def _serialize(value):
    """Convert non-JSON-serializable types."""
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def _row_to_dict(row) -> dict:
    """Convert an ORM model to a plain dict with serializable values."""
    d = {}
    for col in row.__table__.columns:
        attr_name = col.key
        # Handle the metadata_ -> metadata column alias
        val = getattr(row, attr_name if attr_name != "metadata" else "metadata_", None)
        d[col.name] = _serialize(val)
    return d


@router.get("/backup")
async def backup(
    dateFrom: str | None = Query(None),
    dateTo: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    # Fetch all reference tables
    categories = (await db.execute(select(Category))).scalars().all()
    users = (await db.execute(select(User))).scalars().all()
    sources = (await db.execute(select(Source))).scalars().all()
    reports = (await db.execute(select(Report))).scalars().all()
    date_ranges = (await db.execute(select(DateRange))).scalars().all()
    metadata_rows = (await db.execute(select(Metadata))).scalars().all()
    accounts = (await db.execute(select(Account))).scalars().all()
    account_balances = (await db.execute(select(AccountBalance))).scalars().all()

    # Transactions with optional date filter
    txn_query = select(Transaction)
    if dateFrom:
        txn_query = txn_query.where(Transaction.date >= date.fromisoformat(dateFrom))
    if dateTo:
        txn_query = txn_query.where(Transaction.date <= date.fromisoformat(dateTo))
    transactions = (await db.execute(txn_query)).scalars().all()

    return {
        "categories": [_row_to_dict(r) for r in categories],
        "users": [_row_to_dict(r) for r in users],
        "sources": [_row_to_dict(r) for r in sources],
        "reports": [_row_to_dict(r) for r in reports],
        "date_ranges": [_row_to_dict(r) for r in date_ranges],
        "metadata": [_row_to_dict(r) for r in metadata_rows],
        "accounts": [_row_to_dict(r) for r in accounts],
        "account_balances": [_row_to_dict(r) for r in account_balances],
        "transactions": [_row_to_dict(r) for r in transactions],
    }


@router.post("/restore")
async def restore(
    backupFile: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
):
    if not backupFile:
        return JSONResponse(
            status_code=400, content={"error": "No backup file provided"}
        )

    content = await backupFile.read()
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        return JSONResponse(status_code=400, content={"error": "Invalid JSON"})

    # Restore order matters for FK dependencies
    for user in data.get("users", []):
        stmt = (
            insert(User)
            .values(id=user["id"], name=user.get("name", ""))
            .on_conflict_do_nothing(index_elements=["id"])
        )
        await db.execute(stmt)

    for cat in data.get("categories", []):
        stmt = (
            insert(Category)
            .values(name=cat["name"])
            .on_conflict_do_nothing(index_elements=["name"])
        )
        await db.execute(stmt)

    for source in data.get("sources", []):
        stmt = (
            insert(Source)
            .values(
                id=source["id"],
                name=source.get("name", ""),
                mappings=source.get("mappings"),
                flip_income_expense=source.get("flip_income_expense", False),
            )
            .on_conflict_do_nothing(index_elements=["id"])
        )
        await db.execute(stmt)

    for txn in data.get("transactions", []):
        txn_date = txn["date"]
        if isinstance(txn_date, str):
            txn_date = date.fromisoformat(txn_date)
        stmt = (
            insert(Transaction)
            .values(
                id=txn["id"],
                date=txn_date,
                description=txn["description"],
                category=txn.get("category", "Uncategorized"),
                amount=txn["amount"],
                type=txn["type"],
                user_id=txn.get("user_id", ""),
                labels=txn.get("labels", []),
                metadata_=txn.get("metadata", {}),
                transfer_info=txn.get("transfer_info"),
                excluded_from_calculations=txn.get("excluded_from_calculations", False),
            )
            .on_conflict_do_nothing(index_elements=["id"])
        )
        await db.execute(stmt)

    for report in data.get("reports", []):
        stmt = (
            insert(Report)
            .values(
                id=report["id"],
                name=report.get("name", ""),
                description=report.get("description"),
                filters=report.get("filters"),
            )
            .on_conflict_do_nothing(index_elements=["id"])
        )
        await db.execute(stmt)

    for dr in data.get("date_ranges", []):
        start = dr["start_date"]
        end = dr["end_date"]
        if isinstance(start, str):
            start = date.fromisoformat(start)
        if isinstance(end, str):
            end = date.fromisoformat(end)
        stmt = (
            insert(DateRange)
            .values(
                id=dr["id"],
                start_date=start,
                end_date=end,
            )
            .on_conflict_do_nothing(index_elements=["id"])
        )
        await db.execute(stmt)

    for meta in data.get("metadata", []):
        stmt = (
            insert(Metadata)
            .values(key=meta["key"], value=meta.get("value"))
            .on_conflict_do_nothing(index_elements=["key"])
        )
        await db.execute(stmt)

    for acct in data.get("accounts", []):
        stmt = (
            insert(Account)
            .values(
                id=acct["id"],
                user_id=acct.get("user_id"),
                name=acct.get("name", ""),
                type=acct.get("type", "asset"),
            )
            .on_conflict_do_nothing(index_elements=["id"])
        )
        await db.execute(stmt)

    for bal in data.get("account_balances", []):
        bal_date = bal["date"]
        if isinstance(bal_date, str):
            bal_date = date.fromisoformat(bal_date)
        stmt = (
            insert(AccountBalance)
            .values(
                id=bal["id"],
                account_id=bal["account_id"],
                balance=bal["balance"],
                date=bal_date,
                note=bal.get("note"),
            )
            .on_conflict_do_nothing(index_elements=["id"])
        )
        await db.execute(stmt)

    await db.commit()

    return {"success": True, "message": "Restore completed successfully."}
