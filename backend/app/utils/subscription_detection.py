"""Pure subscription detection algorithm.

Groups transactions by normalized signature + type, then checks whether each
group forms a regular cadence (weekly/biweekly/monthly/quarterly/annual) with
consistent amount. Mirrors the structure of transfer_detection.py.
"""

from __future__ import annotations

import math
import secrets
import time
from typing import Any, TypedDict

from app.utils.subscription_signature import normalize_signature

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

    detected: list[dict[str, Any]] = []
    assignments: dict[str, str | None] = {t["id"]: None for t in transactions}

    for (signature, type_), members in groups.items():
        if len(members) < MIN_OCCURRENCES:
            continue
        pruned = _prune_amount_outliers(members)
        if len(pruned) < MIN_OCCURRENCES:
            continue
        pruned.sort(key=lambda t: t["date"])
        cadence = _infer_cadence(pruned)
        if cadence is None:
            continue

        sub = _build_subscription(signature, type_, cadence, pruned)
        detected.append(sub)
        for m in pruned:
            assignments[m["id"]] = sub["id"]

    return {"subscriptions": detected, "transaction_assignments": assignments}


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


def _group_by_signature(
    transactions: list[dict],
) -> dict[tuple[str, str], list[dict]]:
    groups: dict[tuple[str, str], list[dict]] = {}
    for t in transactions:
        sig = normalize_signature(t["description"])
        if not sig:
            continue
        key = (sig, t["type"])
        groups.setdefault(key, []).append(t)
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
    type_: str,
    cadence: str,
    members: list[dict],
) -> dict[str, Any]:
    amounts = [abs(float(m["amount"])) for m in members]
    median = sorted(amounts)[len(amounts) // 2]
    return {
        "id": _new_id(),
        "name": _signature_to_name(signature),
        "cadence": cadence,
        "expected_amount": median,
        "type": type_,
        "status": "active",
        "first_seen": members[0]["date"],
        "last_seen": members[-1]["date"],
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
