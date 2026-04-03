from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.transaction import Transaction
from app.schemas.transfer import TransferOverrideRequest
from app.utils.transfer_utils import run_detection

router = APIRouter(prefix="/api", tags=["transfers"])


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


@router.post("/detect-transfers")
async def run_detect_transfers(db: AsyncSession = Depends(get_db)):
    result = await run_detection(db)
    if result is None:
        return JSONResponse(status_code=404, content={"error": "No transactions found"})
    return result


@router.post("/rerun-transfer-detection")
async def rerun_transfer_detection(db: AsyncSession = Depends(get_db)):
    """Legacy endpoint — re-detects transfers from scratch."""
    result = await run_detection(db, strip_existing=True)
    if result is None:
        return JSONResponse(status_code=404, content={"error": "No transactions found"})
    return {**result, "message": "Transfer detection completed successfully"}
