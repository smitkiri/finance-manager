"""
Transfer detection algorithm.

Ports the heuristic transfer matching from legacy/helpers/transferDetection.js.
Matches debit/credit pairs across sources/users within a 4-day window.
"""

import secrets
import time

from app.utils.date_parser import parse_date


def detect_transfers(transactions: list[dict]) -> dict:
    """Detect transfer pairs among transactions.

    Two-phase approach:
    1. Cross-source transfers (different sourceId in metadata)
    2. Within-source, cross-user transfers

    Returns dict with 'transfers' (matched pairs) and 'updatedTransactions'
    (all transactions with transferInfo populated for matched pairs).
    """
    transfers = []
    updated_transactions = [dict(t) for t in transactions]
    processed_ids: set[str] = set()

    # Group by source
    by_source: dict[str, list[dict]] = {}
    for t in transactions:
        source_id = (t.get("metadata") or {}).get("sourceId", "manual") or "manual"
        by_source.setdefault(source_id, []).append(t)

    source_ids = list(by_source.keys())

    # Phase 1: Cross-source transfers
    for i in range(len(source_ids)):
        for j in range(i + 1, len(source_ids)):
            for t1 in by_source[source_ids[i]]:
                if t1["id"] in processed_ids:
                    continue
                for t2 in by_source[source_ids[j]]:
                    if t2["id"] in processed_ids:
                        continue
                    if is_transfer_pair(t1, t2):
                        _record_transfer(t1, t2, transfers, processed_ids)
                        break

    # Phase 2: Within-source, cross-user transfers
    for source_id in source_ids:
        by_user: dict[str, list[dict]] = {}
        for t in by_source[source_id]:
            user = t.get("user", "")
            by_user.setdefault(user, []).append(t)

        user_ids = list(by_user.keys())
        for i in range(len(user_ids)):
            for j in range(i + 1, len(user_ids)):
                for t1 in by_user[user_ids[i]]:
                    if t1["id"] in processed_ids:
                        continue
                    for t2 in by_user[user_ids[j]]:
                        if t2["id"] in processed_ids:
                            continue
                        if is_transfer_pair(t1, t2):
                            _record_transfer(t1, t2, transfers, processed_ids)
                            break

    # Update transactions with transfer info
    updated_map = {t["id"]: t for t in updated_transactions}
    for transfer in transfers:
        transfer_type = (
            "self"
            if transfer["credit"].get("user") == transfer["debit"].get("user")
            else "user"
        )
        info = {
            "isTransfer": True,
            "transferId": transfer["transferId"],
            "transferType": transfer_type,
            "excludedFromCalculations": True,
            "userOverride": False,
        }
        if transfer["credit"]["id"] in updated_map:
            updated_map[transfer["credit"]["id"]]["transferInfo"] = info
        if transfer["debit"]["id"] in updated_map:
            updated_map[transfer["debit"]["id"]]["transferInfo"] = info

    return {
        "transfers": transfers,
        "updatedTransactions": list(updated_map.values()),
    }


def _record_transfer(
    t1: dict,
    t2: dict,
    transfers: list[dict],
    processed_ids: set[str],
) -> None:
    transfer_id = f"transfer_{int(time.time() * 1000)}_{secrets.token_hex(5)}"
    confidence = calculate_transfer_confidence(t1, t2)
    transfers.append(
        {
            "credit": t1 if t1["type"] == "income" else t2,
            "debit": t1 if t1["type"] == "expense" else t2,
            "transferId": transfer_id,
            "confidence": confidence,
        }
    )
    processed_ids.add(t1["id"])
    processed_ids.add(t2["id"])


def is_transfer_pair(t1: dict, t2: dict) -> bool:
    """Check if two transactions could be a transfer pair.

    Conditions:
    - Not same source AND same user
    - Different types (one expense, one income)
    - Same absolute amount
    - Within 4 days of each other
    """
    source1 = (t1.get("metadata") or {}).get("sourceId", "manual") or "manual"
    source2 = (t2.get("metadata") or {}).get("sourceId", "manual") or "manual"
    user1 = t1.get("user", "")
    user2 = t2.get("user", "")

    if source1 == source2 and user1 == user2:
        return False
    if t1["type"] == t2["type"]:
        return False
    if abs(t1["amount"]) != abs(t2["amount"]):
        return False

    d1 = parse_date(t1["date"])
    d2 = parse_date(t2["date"])
    return not abs((d1 - d2).days) > 4


def calculate_transfer_confidence(t1: dict, t2: dict) -> float:
    """Calculate confidence score for a potential transfer pair.

    Scoring:
    - Base: 0.5
    - Exact amount match: +0.4 (required, else return 0)
    - Same day: +0.2, 1 day: +0.15, 2 days: +0.1, 3 days: +0.05
    - "transfer" in description: +0.1
    - "move" in description: +0.05
    - Capped at 1.0
    """
    confidence = 0.5

    if abs(t1["amount"]) == abs(t2["amount"]):
        confidence += 0.4
    else:
        return 0

    d1 = parse_date(t1["date"])
    d2 = parse_date(t2["date"])
    days_diff = abs((d1 - d2).days)
    if days_diff == 0:
        confidence += 0.2
    elif days_diff <= 1:
        confidence += 0.15
    elif days_diff <= 2:
        confidence += 0.1
    elif days_diff <= 3:
        confidence += 0.05

    desc1 = t1.get("description", "").lower()
    desc2 = t2.get("description", "").lower()
    if "transfer" in desc1 or "transfer" in desc2:
        confidence += 0.1
    if "move" in desc1 or "move" in desc2:
        confidence += 0.05

    return min(confidence, 1.0)
