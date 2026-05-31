import json
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.demo.limits import refuse_in_demo_mode
from app.dependencies.auth import get_current_household_id, get_current_user
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
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    # Fetch household-scoped tables
    categories = (
        (
            await db.execute(
                select(Category).where(Category.household_id == household_id)
            )
        )
        .scalars()
        .all()
    )
    users = (
        (await db.execute(select(User).where(User.household_id == household_id)))
        .scalars()
        .all()
    )
    sources = (
        (await db.execute(select(Source).where(Source.household_id == household_id)))
        .scalars()
        .all()
    )
    reports = (
        (await db.execute(select(Report).where(Report.household_id == household_id)))
        .scalars()
        .all()
    )
    date_ranges = (
        (
            await db.execute(
                select(DateRange).where(DateRange.household_id == household_id)
            )
        )
        .scalars()
        .all()
    )
    # Metadata is a global key-value store, not household-scoped.
    metadata_rows = (await db.execute(select(Metadata))).scalars().all()
    accounts = (
        (await db.execute(select(Account).where(Account.household_id == household_id)))
        .scalars()
        .all()
    )
    account_ids = [a.id for a in accounts]
    if account_ids:
        account_balances = (
            (
                await db.execute(
                    select(AccountBalance).where(
                        AccountBalance.account_id.in_(account_ids)
                    )
                )
            )
            .scalars()
            .all()
        )
    else:
        account_balances = []

    # Transactions with optional date filter (scoped to household)
    txn_query = select(Transaction).where(Transaction.household_id == household_id)
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
    user: User = Depends(get_current_user),
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    refuse_in_demo_mode()
    if not backupFile:
        return JSONResponse(
            status_code=400, content={"error": "No backup file provided"}
        )

    content = await backupFile.read()
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        return JSONResponse(status_code=400, content={"error": "Invalid JSON"})

    # Restore order matters for FK dependencies. Backup content is forced into
    # the caller's household — even if the file came from a different household,
    # restoring it adopts the rows into the current household.
    #
    # User rows from the upload are intentionally ignored: accepting them would
    # let any authenticated user seed a login-capable account with an
    # attacker-chosen email + password_hash. Existing household members are
    # preserved via `created_by_user_id` attribution; rows attributed to
    # uploaded users that don't exist in this household are re-attributed to
    # the caller.
    valid_user_ids = {
        row.id
        for row in (
            await db.execute(select(User).where(User.household_id == household_id))
        )
        .scalars()
        .all()
    }
    valid_user_ids.add(user.id)

    def _attribute(uploaded: str | None) -> str:
        return uploaded if uploaded in valid_user_ids else user.id

    for cat in data.get("categories", []):
        cat_name = cat.get("name", "")
        cat_id = cat.get("id") or cat_name
        stmt = (
            insert(Category)
            .values(id=cat_id, name=cat_name, household_id=household_id)
            .on_conflict_do_nothing(index_elements=["id"])
        )
        await db.execute(stmt)

    for source in data.get("sources", []):
        stmt = (
            insert(Source)
            .values(
                id=source["id"],
                name=source.get("name", ""),
                household_id=household_id,
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
        # Backups taken before the household migration use `user_id`;
        # newer backups use `created_by_user_id`.
        uploaded_attr = txn.get("created_by_user_id") or txn.get("user_id")
        stmt = (
            insert(Transaction)
            .values(
                id=txn["id"],
                date=txn_date,
                description=txn["description"],
                category=txn.get("category", "Uncategorized"),
                amount=txn["amount"],
                type=txn["type"],
                household_id=household_id,
                created_by_user_id=_attribute(uploaded_attr),
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
                household_id=household_id,
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
                household_id=household_id,
                start_date=start,
                end_date=end,
            )
            .on_conflict_do_nothing(index_elements=["id"])
        )
        await db.execute(stmt)

    # Metadata is a global KV store, but the only keys that should be
    # restorable are the per-household Teller keys introduced in Phase 2.
    # Reject everything else outright — restore must never be a vehicle for
    # cross-tenant metadata pollution (e.g. overwriting another household's
    # `teller_enrollments:<hid>` row).
    allowed_metadata_keys = {
        f"teller_enrollments:{household_id}",
        f"teller_category_mappings:{household_id}",
    }
    for meta in data.get("metadata", []):
        if meta.get("key") not in allowed_metadata_keys:
            continue
        stmt = (
            insert(Metadata)
            .values(key=meta["key"], value=meta.get("value"))
            .on_conflict_do_nothing(index_elements=["key"])
        )
        await db.execute(stmt)

    for acct in data.get("accounts", []):
        uploaded_attr = acct.get("created_by_user_id") or acct.get("user_id")
        stmt = (
            insert(Account)
            .values(
                id=acct["id"],
                household_id=household_id,
                created_by_user_id=_attribute(uploaded_attr),
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

    return {
        "success": True,
        "message": (
            "Restore completed. Note: user rows in the upload were ignored "
            "for security reasons; rows attributed to non-household users "
            "were re-attributed to you."
        ),
    }
