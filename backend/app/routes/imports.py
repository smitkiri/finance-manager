import secrets
import time
from decimal import Decimal

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse, PlainTextResponse
from sqlalchemy import delete, select
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
from app.utils.csv_parser import merge_expenses, parse_csv, parse_csv_with_mapping
from app.utils.date_parser import parse_date
from app.utils.transfer_detection import detect_transfers
from app.utils.transfer_utils import txns_to_dicts

router = APIRouter(prefix="/api", tags=["imports"])


COLUMN_MAPPINGS_KEY = "column_mappings"


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

    # Load existing transactions for this household
    result = await db.execute(
        select(Transaction).where(Transaction.household_id == household_id)
    )
    existing_orm = result.scalars().all()
    existing_dicts = txns_to_dicts(existing_orm)

    # Merge (deduplicate)
    merge_result = merge_expenses(existing_dicts, new_transactions)
    merged = merge_result["merged"]
    added = merge_result["added"]

    # Run transfer detection on full merged set
    detection = detect_transfers(merged)
    updated = detection["updatedTransactions"]

    assert_demo_replace_count(
        len(updated), cap=settings.demo_max_transactions, entity="transactions"
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

    # Delete all transactions in this household and reinsert
    await db.execute(
        delete(Transaction).where(Transaction.household_id == household_id)
    )
    db.add(import_session)
    await db.flush()

    added_ids = {id(t) for t in added}
    for t in updated:
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
                transfer_info=t.get("transferInfo"),
                excluded_from_calculations=t.get("excludedFromCalculations", False),
                import_id=session_id if id(t) in added_ids else None,
            )
        )

    await db.commit()

    return {
        "success": True,
        "imported": len(new_transactions),
        "added": len(added),
        "total": len(updated),
        "transfersDetected": len(detection["transfers"]),
        "sessionId": session_id,
    }


@router.post("/import-with-mapping")
async def import_with_mapping(
    body: ImportWithMappingRequest,
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

    # Merge (deduplicate)
    merge_result = merge_expenses(existing_dicts, new_transactions)
    merged = merge_result["merged"]
    added = merge_result["added"]

    # Run transfer detection
    detection = detect_transfers(merged)
    updated = detection["updatedTransactions"]

    assert_demo_replace_count(
        len(updated), cap=settings.demo_max_transactions, entity="transactions"
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

    # Delete transactions in this household and reinsert
    await db.execute(
        delete(Transaction).where(Transaction.household_id == household_id)
    )
    db.add(import_session)
    await db.flush()

    added_ids = {id(t) for t in added}
    for t in updated:
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
                transfer_info=t.get("transferInfo"),
                excluded_from_calculations=t.get("excludedFromCalculations", False),
                import_id=session_id if id(t) in added_ids else None,
            )
        )

    await db.commit()

    return {
        "success": True,
        "imported": len(new_transactions),
        "added": len(added),
        "total": len(updated),
        "transfersDetected": len(detection["transfers"]),
        "autoFilledCategories": auto_filled,
        "sessionId": session_id,
    }
