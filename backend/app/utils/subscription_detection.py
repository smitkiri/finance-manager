"""Pure subscription detection algorithm.

Groups expense transactions by normalized signature, then checks whether each
group forms a regular cadence (weekly/biweekly/monthly/quarterly/annual) with
consistent amount. Mirrors the structure of transfer_detection.py.
"""

from __future__ import annotations

import math
import secrets
import time
from datetime import date as date_type
from typing import Any, TypedDict

from app.utils.subscription_signature import normalize_signature


def _today() -> date_type:
    """Wrapped for test override."""
    return date_type.today()


CADENCE_DAYS: dict[str, int] = {
    "weekly": 7,
    "biweekly": 14,
    "monthly": 30,
    "quarterly": 91,
    "annual": 365,
}

CADENCE_TOLERANCE_DAYS: dict[str, int] = {
    "weekly": 2,
    "biweekly": 2,
    "monthly": 3,
    "quarterly": 5,
    "annual": 10,
}

CADENCE_ORDER: list[str] = ["weekly", "biweekly", "monthly", "quarterly", "annual"]

MIN_OCCURRENCES = 3
INTERVAL_MATCH_RATIO = 0.7  # >=70% of consecutive intervals must match cadence

AMOUNT_ABS_TOLERANCE = 0.50  # dollars
AMOUNT_REL_TOLERANCE = 0.01  # 1%


class DetectionResult(TypedDict):
    subscriptions: list[dict[str, Any]]
    transaction_assignments: dict[str, str | None]


def detect_subscriptions(
    transactions: list[dict],
    existing_subscriptions: list[dict],
) -> DetectionResult:
    """Detect subscriptions across the given transactions.

    Returns a list of subscription dicts (new + updated) plus an assignment
    map of `{txn_id: subscription_id_or_None}` reflecting the full target state.
    """
    eligible = _filter_eligible(transactions, existing_subscriptions)
    groups = _group_by_signature(eligible)

    txn_by_id = {t["id"]: t for t in transactions}

    # Manual subs never auto-match. Cancelled subs DO match (so the user's
    # explicit "cancelled" decision sticks across re-detections) — but they
    # adopt new transactions without changing status.
    existing_by_sig: dict[str, dict] = {}
    for sub in existing_subscriptions:
        if sub["status"] == "manual":
            continue
        sig = sub.get("detection_signature")
        if sig:
            existing_by_sig[sig] = sub

    out_subs: list[dict[str, Any]] = []
    assignments: dict[str, str | None] = {t["id"]: None for t in transactions}
    handled_ids: set[str] = set()

    for signature, members in groups.items():
        if len(members) < MIN_OCCURRENCES:
            continue
        pruned = _prune_amount_outliers(members)
        if len(pruned) < MIN_OCCURRENCES:
            continue
        pruned.sort(key=lambda t: t["date"])
        cadence = _infer_cadence(pruned)
        if cadence is None:
            continue

        existing = existing_by_sig.get(signature)
        if existing is not None:
            if existing["status"] == "cancelled":
                sub = _adopt_into_cancelled(existing, pruned, txn_by_id)
            else:
                sub = _update_existing(existing, pruned, cadence, txn_by_id)
            handled_ids.add(existing["id"])
        else:
            sub = _build_subscription(signature, cadence, pruned)

        out_subs.append(sub)
        for tid in sub["member_txn_ids"]:
            assignments[tid] = sub["id"]

    # Carry over existing subs that didn't get a detected match.
    for sub in existing_subscriptions:
        if sub["id"] in handled_ids:
            continue
        carried = _carry_forward(sub, txn_by_id)
        out_subs.append(carried)
        for tid in carried["member_txn_ids"]:
            assignments[tid] = carried["id"]

    return {"subscriptions": out_subs, "transaction_assignments": assignments}


def _adopt_into_cancelled(
    existing: dict,
    pruned: list[dict],
    txn_by_id: dict[str, dict],
) -> dict[str, Any]:
    """Adopt newly-detected matching txns into a cancelled sub without
    changing its user-set status, name, cadence, or amount. Prevents a
    duplicate sub from appearing every time detection re-runs."""
    overrides = existing.get("user_overrides") or {}
    excluded = set(overrides.get("excludedTxnIds") or [])
    included = list(overrides.get("includedTxnIds") or [])

    member_ids = [m["id"] for m in pruned if m["id"] not in excluded]
    for tid in included:
        if tid in txn_by_id and tid not in member_ids and tid not in excluded:
            member_ids.append(tid)

    members = sorted(
        [txn_by_id[t] for t in member_ids if t in txn_by_id],
        key=lambda t: t["date"],
    )
    first_seen = members[0]["date"] if members else existing.get("first_seen")
    last_seen = members[-1]["date"] if members else existing.get("last_seen")

    return {
        "id": existing["id"],
        "name": existing["name"],
        "cadence": existing["cadence"],
        "expected_amount": float(existing["expected_amount"]),
        "status": "cancelled",
        "first_seen": first_seen,
        "last_seen": last_seen,
        "detection_signature": existing.get("detection_signature"),
        "user_overrides": overrides,
        "metadata": existing.get("metadata") or {},
        "member_txn_ids": member_ids,
    }


def _update_existing(
    existing: dict,
    pruned: list[dict],
    cadence: str,
    txn_by_id: dict[str, dict],
) -> dict[str, Any]:
    overrides = existing["user_overrides"] or {}
    excluded = set(overrides.get("excludedTxnIds") or [])
    included = list(overrides.get("includedTxnIds") or [])

    member_ids = [m["id"] for m in pruned if m["id"] not in excluded]
    for tid in included:
        if tid in txn_by_id and tid not in member_ids and tid not in excluded:
            member_ids.append(tid)

    members_for_stats = [txn_by_id[t] for t in member_ids if t in txn_by_id]
    members_for_stats.sort(key=lambda t: t["date"])

    amounts = [abs(float(m["amount"])) for m in members_for_stats] or [
        float(existing.get("expected_amount") or 0)
    ]
    median = sorted(amounts)[len(amounts) // 2]

    name = (
        existing["name"]
        if overrides.get("lockName")
        else _signature_to_name(existing.get("detection_signature") or "")
    )
    amount = (
        float(existing["expected_amount"]) if overrides.get("lockAmount") else median
    )
    final_cadence = existing["cadence"] if overrides.get("lockCadence") else cadence

    first_seen = (
        members_for_stats[0]["date"]
        if members_for_stats
        else existing.get("first_seen")
    )
    last_seen = (
        members_for_stats[-1]["date"]
        if members_for_stats
        else existing.get("last_seen")
    )

    return {
        "id": existing["id"],
        "name": name,
        "cadence": final_cadence,
        "expected_amount": amount,
        "status": "active",
        "first_seen": first_seen,
        "last_seen": last_seen,
        "detection_signature": existing.get("detection_signature"),
        "user_overrides": overrides,
        "metadata": existing.get("metadata") or {},
        "member_txn_ids": member_ids,
    }


def _carry_forward(existing: dict, txn_by_id: dict[str, dict]) -> dict[str, Any]:
    overrides = existing["user_overrides"] or {}
    excluded = set(overrides.get("excludedTxnIds") or [])
    included = list(overrides.get("includedTxnIds") or [])

    # Existing members come from the FK column on the transactions input.
    member_ids = [
        t["id"]
        for t in txn_by_id.values()
        if t.get("subscriptionId") == existing["id"] and t["id"] not in excluded
    ]
    for tid in included:
        if tid in txn_by_id and tid not in member_ids and tid not in excluded:
            member_ids.append(tid)

    members = sorted(
        [txn_by_id[t] for t in member_ids if t in txn_by_id],
        key=lambda t: t["date"],
    )
    first_seen = members[0]["date"] if members else existing.get("first_seen")
    last_seen = members[-1]["date"] if members else existing.get("last_seen")

    status = existing["status"]
    if status == "active":
        cadence_days = CADENCE_DAYS.get(existing["cadence"], 30)
        days_since = (_today() - last_seen).days if last_seen else cadence_days * 2
        if days_since > int(1.5 * cadence_days):
            status = "possibly_cancelled"

    return {
        "id": existing["id"],
        "name": existing["name"],
        "cadence": existing["cadence"],
        "expected_amount": float(existing["expected_amount"]),
        "status": status,
        "first_seen": first_seen,
        "last_seen": last_seen,
        "detection_signature": existing.get("detection_signature"),
        "user_overrides": overrides,
        "metadata": existing.get("metadata") or {},
        "member_txn_ids": member_ids,
    }


def _filter_eligible(
    transactions: list[dict],
    existing_subscriptions: list[dict],
) -> list[dict]:
    excluded_ids: set[str] = set()
    for sub in existing_subscriptions:
        overrides = sub.get("user_overrides") or {}
        for tid in overrides.get("excludedTxnIds") or []:
            excluded_ids.add(tid)

    eligible = []
    for t in transactions:
        if t.get("type") != "expense":
            continue
        info = t.get("transferInfo") or {}
        if info.get("isTransfer"):
            continue
        if t.get("excludedFromCalculations"):
            continue
        if t["id"] in excluded_ids:
            continue
        if not (t.get("description") or "").strip():
            continue
        eligible.append(t)
    return eligible


def _group_by_signature(transactions: list[dict]) -> dict[str, list[dict]]:
    groups: dict[str, list[dict]] = {}
    for t in transactions:
        sig = normalize_signature(t["description"])
        if not sig:
            continue
        groups.setdefault(sig, []).append(t)
    return groups


def _prune_amount_outliers(members: list[dict]) -> list[dict]:
    amounts = sorted(abs(float(m["amount"])) for m in members)
    n = len(amounts)
    median = amounts[n // 2] if n % 2 else (amounts[n // 2 - 1] + amounts[n // 2]) / 2
    tolerance = max(AMOUNT_ABS_TOLERANCE, AMOUNT_REL_TOLERANCE * median)
    return [m for m in members if abs(abs(float(m["amount"])) - median) <= tolerance]


def _infer_cadence(sorted_members: list[dict]) -> str | None:
    intervals = [
        (sorted_members[i + 1]["date"] - sorted_members[i]["date"]).days
        for i in range(len(sorted_members) - 1)
    ]
    if not intervals:
        return None
    needed = math.ceil(INTERVAL_MATCH_RATIO * len(intervals))
    for cadence in CADENCE_ORDER:
        target = CADENCE_DAYS[cadence]
        tol = CADENCE_TOLERANCE_DAYS[cadence]
        matches = sum(1 for d in intervals if abs(d - target) <= tol)
        if matches >= needed:
            return cadence
    return None


def _build_subscription(
    signature: str,
    cadence: str,
    members: list[dict],
) -> dict[str, Any]:
    amounts = [abs(float(m["amount"])) for m in members]
    median = sorted(amounts)[len(amounts) // 2]
    last_seen = members[-1]["date"]
    cadence_days = CADENCE_DAYS.get(cadence, 30)
    days_since = (_today() - last_seen).days
    status = "possibly_cancelled" if days_since > int(1.5 * cadence_days) else "active"
    return {
        "id": _new_id(),
        "name": _signature_to_name(signature),
        "cadence": cadence,
        "expected_amount": median,
        "status": status,
        "first_seen": members[0]["date"],
        "last_seen": last_seen,
        "detection_signature": signature,
        "user_overrides": {
            "excludedTxnIds": [],
            "includedTxnIds": [],
            "lockName": False,
            "lockAmount": False,
            "lockCadence": False,
        },
        "metadata": {},
        "member_txn_ids": [m["id"] for m in members],
    }


def _signature_to_name(signature: str) -> str:
    return signature.title() if signature else "Unknown"


def _new_id() -> str:
    return f"sub_{int(time.time() * 1000):x}_{secrets.token_hex(4)}"
