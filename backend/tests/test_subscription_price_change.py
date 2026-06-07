"""Unit tests for the pure compute_price_change helper."""

from __future__ import annotations

from datetime import date

import pytest

from app.utils.subscription_price_change import compute_price_change


def _members(amounts: list[float]) -> list[tuple[date, float]]:
    """Helper: turn a list of amounts into (date, amount) tuples, sorted ascending."""
    return [(date(2026, 1 + i, 5), a) for i, a in enumerate(amounts)]


class TestCadenceSkipRules:
    def test_skips_cancelled(self) -> None:
        members = _members([10.0, 10.0, 12.99])
        assert compute_price_change("monthly", "cancelled", members) is None

    def test_skips_manual(self) -> None:
        members = _members([10.0, 10.0, 12.99])
        assert compute_price_change("monthly", "manual", members) is None

    def test_skips_when_fewer_than_three_members(self) -> None:
        assert (
            compute_price_change("monthly", "active", _members([10.0, 12.99])) is None
        )
        assert compute_price_change("monthly", "active", _members([12.99])) is None
        assert compute_price_change("monthly", "active", []) is None


class TestIncreaseDetection:
    def test_increase_above_absolute_tolerance(self) -> None:
        members = _members([10.0, 10.0, 12.99])
        info = compute_price_change("monthly", "active", members)
        assert info is not None
        assert info.previous_amount == 10.0
        assert info.current_amount == 12.99
        assert info.delta_amount == 2.99
        assert info.percent_change == pytest.approx(29.9, abs=0.05)
        assert info.period_label == "last month"

    def test_increase_within_absolute_tolerance_returns_none(self) -> None:
        # Delta = $0.40, below the $0.50 absolute tolerance.
        members = _members([10.0, 10.0, 10.40])
        assert compute_price_change("monthly", "active", members) is None

    def test_increase_within_relative_tolerance_returns_none(self) -> None:
        # Delta = $0.50 on a $100 median = 0.5%, below the 1% relative tolerance.
        # ($0.50 absolute threshold is not exceeded because we use max(0.50, 1%)
        # = max(0.50, 1.0) = $1.00 for a $100 prior median.)
        members = _members([100.0, 100.0, 100.50])
        assert compute_price_change("monthly", "active", members) is None

    def test_decrease_returns_none(self) -> None:
        members = _members([12.0, 12.0, 10.0])
        assert compute_price_change("monthly", "active", members) is None

    def test_negative_amounts_treated_as_positive(self) -> None:
        # Expense amounts may arrive negative; helper takes abs().
        members = [
            (date(2026, 1, 5), -10.0),
            (date(2026, 2, 5), -10.0),
            (date(2026, 3, 5), -12.99),
        ]
        info = compute_price_change("monthly", "active", members)
        assert info is not None
        assert info.previous_amount == 10.0
        assert info.current_amount == 12.99


class TestPeriodLabel:
    @pytest.mark.parametrize(
        "cadence,label",
        [
            ("weekly", "last week"),
            ("biweekly", "the previous charge"),
            ("monthly", "last month"),
            ("quarterly", "last quarter"),
            ("annual", "last year"),
        ],
    )
    def test_label_per_cadence(self, cadence: str, label: str) -> None:
        members = _members([10.0, 10.0, 12.99])
        info = compute_price_change(cadence, "active", members)
        assert info is not None
        assert info.period_label == label


class TestMedianCalculation:
    def test_prior_median_uses_only_preceding_members(self) -> None:
        # Last is 20.00; prior members are [10, 10, 30]. Median of prior is 10.
        members = _members([10.0, 10.0, 30.0, 20.0])
        info = compute_price_change("monthly", "active", members)
        assert info is not None
        assert info.previous_amount == 10.0
        assert info.current_amount == 20.0
        assert info.delta_amount == 10.0

    def test_rounding_to_two_decimals(self) -> None:
        members = _members([9.999, 9.999, 12.991])
        info = compute_price_change("monthly", "active", members)
        assert info is not None
        # Values should be rounded to 2 decimals for display.
        assert info.previous_amount == 10.0
        assert info.current_amount == 12.99
        assert info.delta_amount == 2.99
