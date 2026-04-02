from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.transaction import Transaction
from app.schemas.transfer import TransferOverrideRequest
from app.utils.transfer_detection import detect_transfers

router = APIRouter(prefix="/api", tags=["transfers"])


def _txns_to_dicts(all_txns, strip_transfer_info: bool = False):
    return [
        {
            "id": t.id,
            "date": t.date,
            "description": t.description,
            "category": t.category,
            "amount": float(t.amount),
            "type": t.type,
            "user": t.user_id,
            "labels": t.labels or [],
            "metadata": t.metadata_ or {},
            "transferInfo": None if strip_transfer_info else t.transfer_info,
            "excludedFromCalculations": t.excluded_from_calculations,
        }
        for t in all_txns
    ]


@router.post("/transfer-override")
async def transfer_override(
    body: TransferOverrideRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Transaction).where(Transaction.id == body.transactionId)
    )
    txn = result.scalar_one_or_none()
    if not txn:
        return JSONResponse(status_code=404, content={"error": "Transaction not found"})

    transfer_info = txn.transfer_info
    if not transfer_info or not transfer_info.get("isTransfer"):
        return JSONResponse(
            status_code=400, content={"error": "Transaction is not a transfer"}
        )

    updated_info = {
        **transfer_info,
        "excludedFromCalculations": not body.includeInCalculations,
        "userOverride": True,
    }

    txn.transfer_info = updated_info
    await db.flush()

    # Update all linked transactions with same transferId
    transfer_id = transfer_info.get("transferId")
    if transfer_id:
        linked = await db.execute(
            select(Transaction).where(
                Transaction.transfer_info["transferId"].astext == transfer_id,
                Transaction.id != body.transactionId,
            )
        )
        for linked_txn in linked.scalars().all():
            linked_txn.transfer_info = updated_info

    await db.commit()

    return {"success": True}


async def _run_detection(db: AsyncSession, strip_existing: bool = False):
    result = await db.execute(select(Transaction))
    all_txns = result.scalars().all()

    if not all_txns:
        return JSONResponse(status_code=404, content={"error": "No transactions found"})

    transactions = _txns_to_dicts(all_txns, strip_transfer_info=strip_existing)
    detection_result = detect_transfers(transactions)

    updated_map = {t["id"]: t for t in detection_result["updatedTransactions"]}
    for txn in all_txns:
        updated = updated_map.get(txn.id)
        if updated:
            txn.transfer_info = updated.get("transferInfo")
            txn.excluded_from_calculations = updated.get(
                "excludedFromCalculations", False
            )

    await db.commit()

    return {
        "success": True,
        "transfersDetected": len(detection_result["transfers"]),
        "totalTransactions": len(transactions),
    }


@router.post("/detect-transfers")
async def run_detect_transfers(db: AsyncSession = Depends(get_db)):
    return await _run_detection(db)


@router.post("/rerun-transfer-detection")
async def rerun_transfer_detection(db: AsyncSession = Depends(get_db)):
    """Legacy endpoint — re-detects transfers from scratch."""
    result = await _run_detection(db, strip_existing=True)
    if isinstance(result, JSONResponse):
        return result
    return {**result, "message": "Transfer detection completed successfully"}
