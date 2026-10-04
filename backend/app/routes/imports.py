import secrets
import time
from decimal import Decimal

from fastapi import APIRouter, BackgroundTasks, Depends
from fastapi.responses import JSONResponse, PlainTextResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.demo.limits import assert_demo_csv_size, assert_demo_replace_count
from app.dependencies.auth import get_current_household_id
from app.models.import_session import ImportSession
from app.models.metadata import Metadata
from app.models.transaction import Transaction
from app.schemas.imports import (
    ImportCsvRequest,
    ImportWithMappingRequest,
    SaveColumnMappingRequest,
)
from app.utils.csv_parser import parse_csv, parse_csv_with_mapping
from app.utils.date_parser import parse_date
from app.utils.subscription_utils import run_detection_bg
from app.utils.transfer_utils import run_detection, txns_to_dicts

router = APIRouter(prefix="/api", tags=["imports"])


COLUMN_MAPPINGS_KEY = "column_mappings"


async def _household_transaction_count(db: AsyncSession, household_id: str) -> int:
    count = await db.scalar(
        select(func.count())
        .select_from(Transaction)
        .where(Transaction.household_id == household_id)
    )
    return count or 0


@router.get("/export-csv")
async def export_csv(
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Transaction)
        .where(Transaction.household_id == household_id)
        .order_by(Transaction.date.desc())
    )
    transactions = result.scalars().all()

    if not transactions:
        return JSONResponse(status_code=404, content={"error": "No transactions found"})

    lines = ["Date,Description,Category,Amount,Type"]
    for t in transactions:
        # Escape CSV fields
        desc = t.description.replace('"', '""')
        cat = (t.category or "").replace('"', '""')
        amount = float(t.amount)
        lines.append(f'{t.date},"{desc}","{cat}",{amount},{t.type}')

    csv_content = "\n".join(lines)
    return PlainTextResponse(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=expenses.csv"},
    )


@router.get("/column-mappings")
async def get_column_mappings(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Metadata).where(Metadata.key == COLUMN_MAPPINGS_KEY)
    )
    meta = result.scalar_one_or_none()
    if not meta or not meta.value:
        return []
    return meta.value


@router.post("/column-mappings")
async def save_column_mapping(
    body: SaveColumnMappingRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Metadata).where(Metadata.key == COLUMN_MAPPINGS_KEY)
    )
    meta = result.scalar_one_or_none()

    if meta:
        current = meta.value or []
        current.append(body.mapping)
        meta.value = current
    else:
        db.add(Metadata(key=COLUMN_MAPPINGS_KEY, value=[body.mapping]))

    await db.commit()

    result = await db.execute(
        select(Metadata).where(Metadata.key == COLUMN_MAPPINGS_KEY)
    )
    meta = result.scalar_one_or_none()
    count = len(meta.value) if meta and meta.value else 0

    return {"success": True, "count": count}


@router.post("/import-csv")
async def import_csv(
    body: ImportCsvRequest,
    bg: BackgroundTasks,
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    assert_demo_csv_size(body.csvText)

    # Parse CSV
    new_transactions = parse_csv(body.csvText, body.fileName, body.userId)
    if not new_transactions:
        return {
            "success": True,
            "imported": 0,
            "added": 0,
            "total": 0,
            "transfersDetected": 0,
            "sessionId": None,
        }

    existing_count = await _household_transaction_count(db, household_id)
    assert_demo_replace_count(
        existing_count + len(new_transactions),
        cap=settings.demo_max_transactions,
        entity="transactions",
    )

    # Create import session
    session_id = f"import_{int(time.time() * 1000)}_{secrets.token_hex(4)}"
    import_session = ImportSession(
        id=session_id,
        household_id=household_id,
        created_by_user_id=body.userId,
        source_name=body.fileName or "CSV Import",
        file_name=body.fileName,
        transaction_count=len(new_transactions),
    )
    db.add(import_session)
    await db.flush()

    # Imports are additive — every parsed row becomes its own transaction.
    for t in new_transactions:
        db.add(
            Transaction(
                id=t["id"],
                date=parse_date(t["date"]),
                description=t["description"],
                category=t["category"],
                amount=Decimal(str(t["amount"])),
                type=t["type"],
                household_id=household_id,
                created_by_user_id=t.get("user") or body.userId or None,
                labels=t.get("labels", []),
                metadata_=t.get("metadata", {}),
                excluded_from_calculations=t.get("excludedFromCalculations", False),
                import_id=session_id,
            )
        )
    await db.flush()

    # Transfer detection runs over the household's full set (commits the inserts)
    detection = await run_detection(db, household_id=household_id)
    bg.add_task(run_detection_bg, household_id)

    return {
        "success": True,
        "imported": len(new_transactions),
        "added": len(new_transactions),
        "total": detection["totalTransactions"] if detection else len(new_transactions),
        "transfersDetected": detection["transfersDetected"] if detection else 0,
        "sessionId": session_id,
    }


@router.post("/import-with-mapping")
async def import_with_mapping(
    body: ImportWithMappingRequest,
    bg: BackgroundTasks,
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    assert_demo_csv_size(body.csvText)

    # Load existing transactions for category auto-fill
    result = await db.execute(
        select(Transaction).where(Transaction.household_id == household_id)
    )
    existing_orm = result.scalars().all()
    existing_dicts = txns_to_dicts(existing_orm)

    # Parse with mapping
    mapping_dict = body.mapping.model_dump()
    parse_result = parse_csv_with_mapping(
        body.csvText, mapping_dict, body.userId, existing_dicts
    )
    new_transactions = parse_result["expenses"]
    auto_filled = parse_result["autoFilledCategories"]

    if not new_transactions:
        return {
            "success": True,
            "imported": 0,
            "added": 0,
            "total": 0,
            "transfersDetected": 0,
            "autoFilledCategories": [],
            "sessionId": None,
        }

    assert_demo_replace_count(
        len(existing_dicts) + len(new_transactions),
        cap=settings.demo_max_transactions,
        entity="transactions",
    )

    # Create import session
    session_id = f"import_{int(time.time() * 1000)}_{secrets.token_hex(4)}"
    import_session = ImportSession(
        id=session_id,
        household_id=household_id,
        created_by_user_id=body.userId,
        source_id=body.mapping.id,
        source_name=body.mapping.name,
        file_name=body.fileName,
        transaction_count=len(new_transactions),
    )
    db.add(import_session)
    await db.flush()

    # Imports are additive — every parsed row becomes its own transaction.
    for t in new_transactions:
        db.add(
            Transaction(
                id=t["id"],
                date=parse_date(t["date"]),
                description=t["description"],
                category=t["category"],
                amount=Decimal(str(t["amount"])),
                type=t["type"],
                household_id=household_id,
                created_by_user_id=t.get("user") or body.userId,
                labels=t.get("labels", []),
                metadata_=t.get("metadata", {}),
                excluded_from_calculations=t.get("excludedFromCalculations", False),
                import_id=session_id,
            )
        )
    await db.flush()

    # Transfer detection runs over the household's full set (commits the inserts)
    detection = await run_detection(db, household_id=household_id)
    bg.add_task(run_detection_bg, household_id)

    return {
        "success": True,
        "imported": len(new_transactions),
        "added": len(new_transactions),
        "total": detection["totalTransactions"] if detection else len(new_transactions),
        "transfersDetected": detection["transfersDetected"] if detection else 0,
        "autoFilledCategories": auto_filled,
        "sessionId": session_id,
    }
