from __future__ import annotations

from datetime import date

from app.utils.subscription_detection import detect_subscriptions


def _txn(
    id_: str,
    *,
    description: str = "Netflix",
    amount: float = 15.99,
    type_: str = "expense",
    d: date | None = None,
    transfer_info: dict | None = None,
    excluded: bool = False,
) -> dict:
    return {
        "id": id_,
        "date": d or date(2026, 1, 1),
        "description": description,
        "category": "Entertainment",
        "amount": amount,
        "type": type_,
        "user": "u1",
        "labels": [],
        "metadata": {},
        "transferInfo": transfer_info,
        "excludedFromCalculations": excluded,
        "subscriptionId": None,
    }


def test_three_monthly_charges_detected() -> None:
    txns = [
        _txn("t1", d=date(2026, 1, 5)),
        _txn("t2", d=date(2026, 2, 4)),
        _txn("t3", d=date(2026, 3, 5)),
    ]
    result = detect_subscriptions(txns, existing_subscriptions=[])

    assert len(result["subscriptions"]) == 1
    sub = result["subscriptions"][0]
    assert sub["cadence"] == "monthly"
    assert sub["type"] == "expense"
    assert float(sub["expected_amount"]) == 15.99
    assert sub["status"] == "active"
    assert sub["first_seen"] == date(2026, 1, 5)
    assert sub["last_seen"] == date(2026, 3, 5)
    assert sub["member_txn_ids"] == ["t1", "t2", "t3"]
    assert result["transaction_assignments"] == {
        "t1": sub["id"],
        "t2": sub["id"],
        "t3": sub["id"],
    }


def test_two_charges_not_enough() -> None:
    txns = [
        _txn("t1", d=date(2026, 1, 5)),
        _txn("t2", d=date(2026, 2, 5)),
    ]
    result = detect_subscriptions(txns, existing_subscriptions=[])
    assert result["subscriptions"] == []


def test_transfer_txns_filtered_out() -> None:
    txns = [
        _txn("t1", d=date(2026, 1, 5), transfer_info={"isTransfer": True}),
        _txn("t2", d=date(2026, 2, 5), transfer_info={"isTransfer": True}),
        _txn("t3", d=date(2026, 3, 5), transfer_info={"isTransfer": True}),
    ]
    result = detect_subscriptions(txns, existing_subscriptions=[])
    assert result["subscriptions"] == []


def test_excluded_txns_filtered_out() -> None:
    txns = [
        _txn("t1", d=date(2026, 1, 5), excluded=True),
        _txn("t2", d=date(2026, 2, 5), excluded=True),
        _txn("t3", d=date(2026, 3, 5), excluded=True),
    ]
    result = detect_subscriptions(txns, existing_subscriptions=[])
    assert result["subscriptions"] == []


def test_amount_drift_within_tolerance_accepted() -> None:
    txns = [
        _txn("t1", amount=15.99, d=date(2026, 1, 5)),
        _txn("t2", amount=16.29, d=date(2026, 2, 5)),
        _txn("t3", amount=15.79, d=date(2026, 3, 5)),
    ]
    result = detect_subscriptions(txns, existing_subscriptions=[])
    assert len(result["subscriptions"]) == 1


def test_amount_outlier_dropped_below_threshold() -> None:
    # Two at 15.99, one at 100.00 — outlier dropped, only 2 remain → no sub.
    txns = [
        _txn("t1", amount=15.99, d=date(2026, 1, 5)),
        _txn("t2", amount=100.00, d=date(2026, 2, 5)),
        _txn("t3", amount=15.99, d=date(2026, 3, 5)),
    ]
    result = detect_subscriptions(txns, existing_subscriptions=[])
    assert result["subscriptions"] == []
