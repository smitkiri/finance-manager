from __future__ import annotations

from datetime import date

import pytest

from app.utils.subscription_detection import detect_subscriptions


@pytest.fixture(autouse=True)
def _pin_today(monkeypatch):
    """Pin `_today()` close to the test transaction dates so detection tests
    aren't affected by the real wall clock or by the new-sub stale check."""
    monkeypatch.setattr(
        "app.utils.subscription_detection._today", lambda: date(2026, 3, 10)
    )


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


def test_biweekly_cadence_detected() -> None:
    txns = [
        _txn(
            "p1",
            description="Acme Payroll",
            amount=2000,
            type_="income",
            d=date(2026, 1, 2),
        ),
        _txn(
            "p2",
            description="Acme Payroll",
            amount=2000,
            type_="income",
            d=date(2026, 1, 16),
        ),
        _txn(
            "p3",
            description="Acme Payroll",
            amount=2000,
            type_="income",
            d=date(2026, 1, 30),
        ),
        _txn(
            "p4",
            description="Acme Payroll",
            amount=2000,
            type_="income",
            d=date(2026, 2, 13),
        ),
    ]
    result = detect_subscriptions(txns, existing_subscriptions=[])
    assert len(result["subscriptions"]) == 1
    assert result["subscriptions"][0]["cadence"] == "biweekly"


def test_quarterly_cadence_detected() -> None:
    txns = [
        _txn("q1", description="Insurance", amount=300, d=date(2026, 1, 15)),
        _txn("q2", description="Insurance", amount=300, d=date(2026, 4, 15)),
        _txn("q3", description="Insurance", amount=300, d=date(2026, 7, 14)),
    ]
    result = detect_subscriptions(txns, existing_subscriptions=[])
    assert len(result["subscriptions"]) == 1
    assert result["subscriptions"][0]["cadence"] == "quarterly"


def test_annual_cadence_detected() -> None:
    txns = [
        _txn("a1", description="Domain Renewal", amount=12, d=date(2024, 3, 10)),
        _txn("a2", description="Domain Renewal", amount=12, d=date(2025, 3, 12)),
        _txn("a3", description="Domain Renewal", amount=12, d=date(2026, 3, 8)),
    ]
    result = detect_subscriptions(txns, existing_subscriptions=[])
    assert len(result["subscriptions"]) == 1
    assert result["subscriptions"][0]["cadence"] == "annual"


def test_late_charge_within_70_percent_rule_accepted() -> None:
    # 3/4 = 0.75 >= 0.7 → still classified as monthly.
    txns = [
        _txn("t1", d=date(2026, 1, 5)),
        _txn("t2", d=date(2026, 2, 5)),  # interval 31 ok
        _txn("t3", d=date(2026, 3, 5)),  # interval 28 ok
        _txn("t4", d=date(2026, 4, 25)),  # interval 51 BAD
        _txn("t5", d=date(2026, 5, 25)),  # interval 30 ok
    ]
    result = detect_subscriptions(txns, existing_subscriptions=[])
    assert len(result["subscriptions"]) == 1
    assert result["subscriptions"][0]["cadence"] == "monthly"


def test_irregular_intervals_below_70_percent_rejected() -> None:
    txns = [
        _txn("t1", d=date(2026, 1, 5)),
        _txn("t2", d=date(2026, 1, 19)),  # 14 days
        _txn("t3", d=date(2026, 3, 15)),  # 55 days
        _txn("t4", d=date(2026, 4, 1)),  # 17 days
    ]
    result = detect_subscriptions(txns, existing_subscriptions=[])
    assert result["subscriptions"] == []


def _existing(
    id_: str,
    *,
    signature: str | None = "netflix",
    name: str = "Netflix",
    cadence: str = "monthly",
    expected_amount: float = 15.99,
    type_: str = "expense",
    status: str = "active",
    first_seen: date | None = date(2026, 1, 5),
    last_seen: date | None = date(2026, 3, 5),
    overrides: dict | None = None,
) -> dict:
    return {
        "id": id_,
        "name": name,
        "cadence": cadence,
        "expected_amount": expected_amount,
        "type": type_,
        "status": status,
        "first_seen": first_seen,
        "last_seen": last_seen,
        "detection_signature": signature,
        "user_overrides": overrides
        or {
            "excludedTxnIds": [],
            "includedTxnIds": [],
            "lockName": False,
            "lockAmount": False,
            "lockCadence": False,
        },
    }


def test_existing_sub_updated_keeps_id() -> None:
    existing = _existing("sub_existing")
    txns = [
        _txn("t1", d=date(2026, 1, 5)),
        _txn("t2", d=date(2026, 2, 5)),
        _txn("t3", d=date(2026, 3, 5)),
        _txn("t4", d=date(2026, 4, 5)),
    ]
    result = detect_subscriptions(txns, existing_subscriptions=[existing])
    assert len(result["subscriptions"]) == 1
    sub = result["subscriptions"][0]
    assert sub["id"] == "sub_existing"
    assert sub["last_seen"] == date(2026, 4, 5)


def test_excluded_txn_id_not_added_to_sub() -> None:
    existing = _existing(
        "sub_existing",
        overrides={
            "excludedTxnIds": ["t2"],
            "includedTxnIds": [],
            "lockName": False,
            "lockAmount": False,
            "lockCadence": False,
        },
    )
    txns = [
        _txn("t1", d=date(2026, 1, 5)),
        _txn("t2", d=date(2026, 2, 5)),
        _txn("t3", d=date(2026, 3, 5)),
        _txn("t4", d=date(2026, 4, 5)),
    ]
    result = detect_subscriptions(txns, existing_subscriptions=[existing])
    sub = result["subscriptions"][0]
    assert "t2" not in sub["member_txn_ids"]
    assert result["transaction_assignments"]["t2"] is None


def test_included_txn_id_force_added() -> None:
    # 'odd_one' has a different description (different signature) but the
    # user explicitly added it to the sub via includedTxnIds.
    existing = _existing(
        "sub_existing",
        overrides={
            "excludedTxnIds": [],
            "includedTxnIds": ["odd_one"],
            "lockName": False,
            "lockAmount": False,
            "lockCadence": False,
        },
    )
    txns = [
        _txn("t1", d=date(2026, 1, 5)),
        _txn("t2", d=date(2026, 2, 5)),
        _txn("t3", d=date(2026, 3, 5)),
        _txn(
            "odd_one", description="Random merchant", amount=15.99, d=date(2026, 4, 1)
        ),
    ]
    result = detect_subscriptions(txns, existing_subscriptions=[existing])
    sub = result["subscriptions"][0]
    assert "odd_one" in sub["member_txn_ids"]
    assert result["transaction_assignments"]["odd_one"] == "sub_existing"


def test_locked_fields_not_overwritten() -> None:
    existing = _existing(
        "sub_existing",
        name="My Custom Name",
        expected_amount=99.99,
        cadence="quarterly",  # wrong on purpose
        overrides={
            "excludedTxnIds": [],
            "includedTxnIds": [],
            "lockName": True,
            "lockAmount": True,
            "lockCadence": True,
        },
    )
    txns = [
        _txn("t1", amount=15.99, d=date(2026, 1, 5)),
        _txn("t2", amount=15.99, d=date(2026, 2, 5)),
        _txn("t3", amount=15.99, d=date(2026, 3, 5)),
    ]
    result = detect_subscriptions(txns, existing_subscriptions=[existing])
    sub = result["subscriptions"][0]
    assert sub["name"] == "My Custom Name"
    assert float(sub["expected_amount"]) == 99.99
    assert sub["cadence"] == "quarterly"


def test_stale_sub_marked_possibly_cancelled(monkeypatch) -> None:
    today = date(2026, 6, 1)
    monkeypatch.setattr("app.utils.subscription_detection._today", lambda: today)
    existing = _existing(
        "sub_existing",
        last_seen=date(2026, 4, 1),  # 61 days ago
    )
    txns: list[dict] = []
    result = detect_subscriptions(txns, existing_subscriptions=[existing])
    assert len(result["subscriptions"]) == 1
    assert result["subscriptions"][0]["status"] == "possibly_cancelled"


def test_cancelled_sub_does_not_auto_match(monkeypatch) -> None:
    today = date(2026, 6, 1)
    monkeypatch.setattr("app.utils.subscription_detection._today", lambda: today)
    existing = _existing("sub_cancelled", status="cancelled")
    txns = [
        _txn("t1", d=date(2026, 3, 5)),
        _txn("t2", d=date(2026, 4, 5)),
        _txn("t3", d=date(2026, 5, 5)),
    ]
    result = detect_subscriptions(txns, existing_subscriptions=[existing])
    assert len(result["subscriptions"]) == 2
    cancelled = next(s for s in result["subscriptions"] if s["id"] == "sub_cancelled")
    new_sub = next(s for s in result["subscriptions"] if s["id"] != "sub_cancelled")
    assert cancelled["status"] == "cancelled"
    assert new_sub["status"] == "active"
    assert new_sub["member_txn_ids"] == ["t1", "t2", "t3"]


def test_manual_sub_not_auto_grown() -> None:
    manual = _existing(
        "sub_manual",
        signature=None,
        status="manual",
        first_seen=None,
        last_seen=None,
    )
    txns = [
        _txn("t1", d=date(2026, 1, 5)),
        _txn("t2", d=date(2026, 2, 5)),
        _txn("t3", d=date(2026, 3, 5)),
    ]
    result = detect_subscriptions(txns, existing_subscriptions=[manual])
    assert len(result["subscriptions"]) == 2
    manual_out = next(s for s in result["subscriptions"] if s["id"] == "sub_manual")
    assert manual_out["status"] == "manual"
    assert manual_out["detection_signature"] is None
