"""Pure subscription detection algorithm.

Groups expense transactions by normalized signature, clusters descriptor
variants of the same merchant, then checks whether each cluster forms a regular
cadence (weekly/biweekly/monthly/quarterly/annual) with consistent amount.
Mirrors the structure of transfer_detection.py.
"""

from __future__ import annotations

import math
import secrets
import time
from datetime import date as date_type
from typing import Any, TypedDict

from app.utils.subscription_signature import merge_key, normalize_signature


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

# Descriptor variants of one merchant are merged only when their typical
# amounts agree this closely, so "amazon" retail never swallows "amazon prime".
CLUSTER_AMOUNT_REL_TOLERANCE = 0.10
# A signature shorter than this never absorbs longer ones by prefix.
CLUSTER_MIN_PREFIX_LEN = 6
# Same-amount charges this close together count once when inferring cadence
# (e.g. the same charge imported from both CSV and a bank feed).
DUPLICATE_CHARGE_DAYS = 3


class DetectionResult(TypedDict):
    subscriptions: list[dict[str, Any]]
    transaction_assignments: dict[str, str | None]
    deleted_subscription_ids: list[str]


class _Cluster(TypedDict):
    signature: str
    signatures: set[str]
    members: list[dict]


class _Evaluated(TypedDict):
    cluster: _Cluster
    pruned: list[dict]
    cadence: str


def detect_subscriptions(
    transactions: list[dict],
    existing_subscriptions: list[dict],
) -> DetectionResult:
    """Detect subscriptions across the given transactions.

    Returns a list of subscription dicts (new + updated) plus an assignment
    map of `{txn_id: subscription_id_or_None}` reflecting the full target state.
    """
    eligible = _filter_eligible(transactions, existing_subscriptions)
    clusters = _cluster_groups(_group_by_signature(eligible))

    txn_by_id = {t["id"]: t for t in transactions}

    # Manual subs never auto-match. Cancelled subs DO match (so the user's
    # explicit "cancelled" decision sticks across re-detections) — but they
    # adopt new transactions without changing status.
    matchable = {
        sub["id"]: sub for sub in existing_subscriptions if sub["status"] != "manual"
    }

    out_subs: list[dict[str, Any]] = []
    assignments: dict[str, str | None] = {t["id"]: None for t in transactions}
    handled_ids: set[str] = set()
    claimed_txn_ids: set[str] = set()

    evaluated: list[_Evaluated] = []
    for cluster in clusters:
        members = cluster["members"]
        if len(members) < MIN_OCCURRENCES:
            continue
        pruned = _prune_amount_outliers(members)
        if len(pruned) < MIN_OCCURRENCES:
            continue
        pruned.sort(key=lambda t: t["date"])
        cadence = _infer_cadence(pruned)
        if cadence is None:
            continue
        evaluated.append({"cluster": cluster, "pruned": pruned, "cadence": cadence})

    # Clusters the user merged into one sub go to that sub first, whatever its
    # status, so a merge survives re-detection.
    by_merge_owner: dict[str, list[_Evaluated]] = {}
    unmerged: list[_Evaluated] = []
    for item in evaluated:
        owner_id = _merge_owner(item["cluster"], existing_subscriptions)
        if owner_id is None:
            unmerged.append(item)
        else:
            by_merge_owner.setdefault(owner_id, []).append(item)

    def _emit(sub: dict[str, Any]) -> None:
        out_subs.append(sub)
        for tid in sub["member_txn_ids"]:
            assignments[tid] = sub["id"]
            claimed_txn_ids.add(tid)

    existing_by_id = {sub["id"]: sub for sub in existing_subscriptions}
    for owner_id in sorted(by_merge_owner):
        items = by_merge_owner[owner_id]
        existing = existing_by_id[owner_id]
        # The most recently charged descriptor sets cadence and signature.
        latest = max(items, key=lambda it: it["pruned"][-1]["date"])
        seen: set[str] = set()
        pruned = []
        for it in items:
            for m in it["pruned"]:
                if m["id"] not in seen:
                    seen.add(m["id"])
                    pruned.append(m)
        pruned.sort(key=lambda t: t["date"])
        signature = latest["cluster"]["signature"]
        if existing["status"] in {"cancelled", "manual"}:
            sub = _adopt_into_frozen(existing, pruned, txn_by_id, signature)
        else:
            sub = _update_existing(
                existing, pruned, latest["cadence"], txn_by_id, signature
            )
        handled_ids.add(owner_id)
        _emit(sub)

    for item in unmerged:
        cluster, pruned, cadence = item["cluster"], item["pruned"], item["cadence"]
        signature = cluster["signature"]
        existing = _match_existing(cluster, matchable, handled_ids)
        if existing is not None:
            if existing["status"] == "cancelled":
                sub = _adopt_into_frozen(existing, pruned, txn_by_id, signature)
            else:
                sub = _update_existing(existing, pruned, cadence, txn_by_id, signature)
            handled_ids.add(existing["id"])
        else:
            sub = _build_subscription(signature, cadence, pruned)
        _emit(sub)

    # Carry over existing subs that didn't get a detected match. Auto-detected
    # subs left with no members (their charges were claimed by a merged
    # cluster, or no longer exist) are deleted instead of lingering.
    deleted_ids: list[str] = []
    for sub in existing_subscriptions:
        if sub["id"] in handled_ids:
            continue
        carried = _carry_forward(sub, txn_by_id, claimed_txn_ids)
        if _is_orphaned_auto_sub(carried):
            deleted_ids.append(carried["id"])
            continue
        out_subs.append(carried)
        for tid in carried["member_txn_ids"]:
            assignments[tid] = carried["id"]

    return {
        "subscriptions": out_subs,
        "transaction_assignments": assignments,
        "deleted_subscription_ids": deleted_ids,
    }


def _match_existing(
    cluster: _Cluster,
    matchable: dict[str, dict],
    handled_ids: set[str],
) -> dict | None:
    """Pick the existing sub a detected cluster continues: the one that
    already owns the most of its charges, else one whose stored signature is
    among the cluster's variants. Ownership wins so a sub survives changes to
    signature normalization or a merchant's descriptor."""
    owned: dict[str, int] = {}
    for m in cluster["members"]:
        sid = m.get("subscriptionId")
        if sid in matchable and sid not in handled_ids:
            owned[sid] = owned.get(sid, 0) + 1
    if owned:
        best = max(sorted(owned), key=lambda sid: owned[sid])
        return matchable[best]
    for sid in sorted(matchable):
        sub = matchable[sid]
        if sid in handled_ids:
            continue
        if sub.get("detection_signature") in cluster["signatures"]:
            return sub
    return None


def _merge_owner(cluster: _Cluster, existing_subscriptions: list[dict]) -> str | None:
    """Return the id of the sub whose user merge covers one of the cluster's
    descriptor variants, if any."""
    for sub in sorted(existing_subscriptions, key=lambda s: s["id"]):
        merged = (sub.get("metadata") or {}).get("mergedSignatures") or []
        if cluster["signatures"].intersection(merged):
            return sub["id"]
    return None


def _is_orphaned_auto_sub(sub: dict) -> bool:
    if sub["member_txn_ids"] or sub["status"] not in {"active", "possibly_cancelled"}:
        return False
    overrides = sub.get("user_overrides") or {}
    return not (
        overrides.get("includedTxnIds")
        or overrides.get("excludedTxnIds")
        or overrides.get("lockName")
        or overrides.get("lockAmount")
        or overrides.get("lockCadence")
    )


def _adopt_into_frozen(
    existing: dict,
    pruned: list[dict],
    txn_by_id: dict[str, dict],
    signature: str,
) -> dict[str, Any]:
    """Adopt newly-detected matching txns into a cancelled (or merged manual)
    sub without changing its user-set status, name, cadence, or amount.
    Prevents a duplicate sub from appearing every time detection re-runs."""
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
        "status": existing["status"],
        "first_seen": first_seen,
        "last_seen": last_seen,
        "detection_signature": signature,
        "user_overrides": overrides,
        "metadata": existing.get("metadata") or {},
        "member_txn_ids": member_ids,
    }


def _update_existing(
    existing: dict,
    pruned: list[dict],
    cadence: str,
    txn_by_id: dict[str, dict],
    signature: str,
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
        existing["name"] if overrides.get("lockName") else _signature_to_name(signature)
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
        "detection_signature": signature,
        "user_overrides": overrides,
        "metadata": existing.get("metadata") or {},
        "member_txn_ids": member_ids,
    }


def _carry_forward(
    existing: dict,
    txn_by_id: dict[str, dict],
    claimed_txn_ids: set[str],
) -> dict[str, Any]:
    overrides = existing["user_overrides"] or {}
    excluded = set(overrides.get("excludedTxnIds") or [])
    included = list(overrides.get("includedTxnIds") or [])

    # Existing members come from the FK column on the transactions input,
    # minus any a detected subscription claimed in this run.
    member_ids = [
        t["id"]
        for t in txn_by_id.values()
        if t.get("subscriptionId") == existing["id"]
        and t["id"] not in excluded
        and t["id"] not in claimed_txn_ids
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
        if t.get("transferGroupId"):
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


def _median(values: list[float]) -> float:
    ordered = sorted(values)
    n = len(ordered)
    return ordered[n // 2] if n % 2 else (ordered[n // 2 - 1] + ordered[n // 2]) / 2


def _amounts_compatible(a: float, b: float) -> bool:
    tolerance = max(AMOUNT_ABS_TOLERANCE, CLUSTER_AMOUNT_REL_TOLERANCE * max(a, b))
    return abs(a - b) <= tolerance


def _cluster_groups(groups: dict[str, list[dict]]) -> list[_Cluster]:
    """Merge signature groups that are descriptor variants of one merchant.

    Two groups merge when one's merge key is a prefix of the other's (or they
    are equal) and their median amounts agree. Processors truncate and re-space
    descriptors ("CLUB AT CHARLES RIV", "CLUBS AT CHARLESBOSTON MA"), so an
    exact-match grouping splits one subscription into several.
    """
    sigs = sorted(groups, key=lambda sig: (merge_key(sig), sig))
    keys = [merge_key(sig) for sig in sigs]
    medians = [_median([abs(float(m["amount"])) for m in groups[s]]) for s in sigs]

    parent = list(range(len(sigs)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    # Keys sharing a prefix sit contiguously after it in sorted order.
    for i, key in enumerate(keys):
        if len(key) < CLUSTER_MIN_PREFIX_LEN:
            continue
        j = i + 1
        while j < len(keys) and keys[j].startswith(key):
            if _amounts_compatible(medians[i], medians[j]):
                parent[find(j)] = find(i)
            j += 1
    # Identical keys shorter than the prefix minimum still merge.
    for i in range(1, len(keys)):
        if keys[i] == keys[i - 1] and _amounts_compatible(medians[i], medians[i - 1]):
            parent[find(i)] = find(i - 1)

    by_root: dict[int, list[int]] = {}
    for i in range(len(sigs)):
        by_root.setdefault(find(i), []).append(i)

    clusters: list[_Cluster] = []
    for indices in by_root.values():
        members = [m for i in indices for m in groups[sigs[i]]]
        # Most frequent variant names the subscription; shorter wins ties.
        canonical = min(
            (sigs[i] for i in indices),
            key=lambda sig: (-len(groups[sig]), len(sig), sig),
        )
        clusters.append(
            {
                "signature": canonical,
                "signatures": {sigs[i] for i in indices},
                "members": members,
            }
        )
    clusters.sort(key=lambda c: c["signature"])
    return clusters


def _prune_amount_outliers(members: list[dict]) -> list[dict]:
    amounts = sorted(abs(float(m["amount"])) for m in members)
    n = len(amounts)
    median = amounts[n // 2] if n % 2 else (amounts[n // 2 - 1] + amounts[n // 2]) / 2
    tolerance = max(AMOUNT_ABS_TOLERANCE, AMOUNT_REL_TOLERANCE * median)

    in_band = [m for m in members if abs(abs(float(m["amount"])) - median) <= tolerance]
    out_band = [m for m in members if abs(abs(float(m["amount"])) - median) > tolerance]

    if not out_band or not in_band:
        return in_band

    # Price-step pattern: if at least 2 outliers all post-date every in-band
    # member and cluster around a consistent new amount, treat them as a price
    # hike and keep them in the subscription. Without this, the new amount
    # gets silently pruned and the subscription appears stuck at the old price.
    in_band_last_date = max(m["date"] for m in in_band)
    tail = [m for m in out_band if m["date"] > in_band_last_date]
    if len(tail) >= 2 and len(tail) == len(out_band):
        tail_amounts = sorted(abs(float(m["amount"])) for m in tail)
        tail_median = tail_amounts[len(tail_amounts) // 2]
        tail_tolerance = max(AMOUNT_ABS_TOLERANCE, AMOUNT_REL_TOLERANCE * tail_median)
        if all(abs(a - tail_median) <= tail_tolerance for a in tail_amounts):
            return in_band + tail

    return in_band


def _collapse_duplicate_charges(sorted_members: list[dict]) -> list[dict]:
    kept: list[dict] = []
    for m in sorted_members:
        if kept:
            prev = kept[-1]
            close = (m["date"] - prev["date"]).days <= DUPLICATE_CHARGE_DAYS
            same = abs(abs(float(m["amount"])) - abs(float(prev["amount"]))) <= (
                AMOUNT_ABS_TOLERANCE
            )
            if close and same:
                continue
        kept.append(m)
    return kept


def _infer_cadence(sorted_members: list[dict]) -> str | None:
    charges = _collapse_duplicate_charges(sorted_members)
    if len(charges) < MIN_OCCURRENCES:
        return None
    intervals = [
        (charges[i + 1]["date"] - charges[i]["date"]).days
        for i in range(len(charges) - 1)
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
