"""
Shared transfer detection helpers.

Used by: transfers, imports, import_sessions, data routes.
"""

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import Transaction
from app.utils.transfer_detection import detect_transfers


def txns_to_dicts(
    all_txns: Sequence[Transaction], strip_transfer_info: bool = False
) -> list[dict]:
    """Convert ORM Transaction objects to dicts for transfer detection."""
    return [
        {
            "id": t.id,
            "date": t.date,
            "description": t.description,
            "category": t.category,
            "amount": float(t.amount),
            "type": t.type,
            "user": t.created_by_user_id,
            "labels": t.labels or [],
            "metadata": t.metadata_ or {},
            "transferInfo": None if strip_transfer_info else t.transfer_info,
            "excludedFromCalculations": t.excluded_from_calculations,
        }
        for t in all_txns
    ]


async def run_detection(db: AsyncSession, strip_existing: bool = False) -> dict | None:
    """Run transfer detection on all transactions and persist results.

    Returns dict with success/transfersDetected/totalTransactions,
    or None if no transactions exist.
    """
    result = await db.execute(select(Transaction))
    all_txns = result.scalars().all()

    if not all_txns:
        return None

    transactions = txns_to_dicts(all_txns, strip_transfer_info=strip_existing)
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
