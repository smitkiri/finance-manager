"""
Shared transfer detection helpers.

Used by: transfers, imports, import_sessions, data, teller routes.
"""

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import Transaction
from app.models.transfer_group import TransferGroup
from app.utils.transfer_detection import detect_transfers
from app.utils.transfer_groups import create_group, dissolve_groups_where


def txns_to_dicts(all_txns: Sequence[Transaction]) -> list[dict]:
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
            "excludedFromCalculations": t.excluded_from_calculations,
        }
        for t in all_txns
    ]


async def run_detection(
    db: AsyncSession,
    strip_existing: bool = False,
    household_id: str | None = None,
) -> dict | None:
    """Detect 1:1 transfer pairs and store them as `auto` transfer groups.

    Only ungrouped transactions are considered, so manual groups are never
    touched. `strip_existing` first dissolves the existing `auto` groups so
    they are re-detected from scratch. Scoped to `household_id` when given;
    pairs never cross households either way.

    Returns dict with success/transfersDetected/totalTransactions,
    or None if no transactions exist.
    """
    if strip_existing:
        clauses = [TransferGroup.source == "auto"]
        if household_id is not None:
            clauses.append(TransferGroup.household_id == household_id)
        await dissolve_groups_where(db, *clauses)

    stmt = select(Transaction)
    if household_id is not None:
        stmt = stmt.where(Transaction.household_id == household_id)
    all_txns = (await db.execute(stmt)).scalars().all()

    if not all_txns:
        return None

    by_household: dict[str, list[Transaction]] = {}
    for txn in all_txns:
        if txn.transfer_group_id is None:
            by_household.setdefault(txn.household_id, []).append(txn)

    detected = 0
    for hid, candidates in by_household.items():
        by_id = {t.id: t for t in candidates}
        result = detect_transfers(txns_to_dicts(candidates))
        for pair in result["transfers"]:
            credit = by_id[pair["credit"]["id"]]
            debit = by_id[pair["debit"]["id"]]
            anchor, member = sorted((credit, debit), key=lambda t: (t.date, t.id))
            await create_group(db, hid, anchor.id, [member.id], source="auto")
            detected += 1

    await db.commit()

    return {
        "success": True,
        "transfersDetected": detected,
        "totalTransactions": len(all_txns),
    }
