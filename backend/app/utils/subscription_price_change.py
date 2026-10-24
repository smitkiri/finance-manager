"""Pure helper: detect a subscription's most-recent price increase."""

from __future__ import annotations

from datetime import date

from app.schemas.subscription import PriceChangeInfo

AMOUNT_ABS_TOLERANCE = 0.50  # dollars; matches subscription_detection.py
AMOUNT_REL_TOLERANCE = 0.01  # 1%; matches subscription_detection.py

PERIOD_LABEL: dict[str, str] = {
    "weekly": "last week",
    "biweekly": "the previous charge",
    "monthly": "last month",
    "quarterly": "last quarter",
    "annual": "last year",
}

SKIPPED_STATUSES: frozenset[str] = frozenset({"cancelled", "manual"})

# Baseline is the median of this many charges before the latest one, so an
# old price from long ago doesn't keep the banner alive.
BASELINE_WINDOW = 3
# Same-amount charges this close together are one charge imported twice;
# matches DUPLICATE_CHARGE_DAYS in subscription_detection.py.
DUPLICATE_CHARGE_DAYS = 3


def _median(values: list[float]) -> float:
    s = sorted(values)
    n = len(s)
    mid = n // 2
    return s[mid] if n % 2 else (s[mid - 1] + s[mid]) / 2


def compute_price_change(
    cadence: str,
    status: str,
    members_by_date: list[tuple[date, float]],
) -> PriceChangeInfo | None:
    """Compute a price-change record from a subscription's member transactions.

    `members_by_date` must be sorted ascending by date. Amounts may be signed;
    we compare absolute values. Returns None when the latest charge isn't an
    increase over the charges just before it, when the previous charge was
    already at the new price, when the subscription is cancelled/manual, or
    when there are fewer than 3 distinct charges to compare.
    """
    if status in SKIPPED_STATUSES:
        return None
    if len(members_by_date) < 3:
        return None

    charges: list[tuple[date, float]] = []
    for d, a in members_by_date:
        if (
            charges
            and (d - charges[-1][0]).days <= DUPLICATE_CHARGE_DAYS
            and abs(abs(a) - charges[-1][1]) <= AMOUNT_ABS_TOLERANCE
        ):
            continue
        charges.append((d, abs(a)))
    if len(charges) < 3:
        return None

    amounts = [a for _, a in charges]
    current = amounts[-1]
    prior_median = _median(amounts[-1 - BASELINE_WINDOW : -1])
    delta = current - prior_median

    tolerance = max(AMOUNT_ABS_TOLERANCE, AMOUNT_REL_TOLERANCE * prior_median)
    if delta <= tolerance:
        return None
    # Only report the change at the charge where it happened; once the
    # previous charge is already at the new price it's old news.
    if abs(current - amounts[-2]) <= tolerance:
        return None

    previous_rounded = round(prior_median, 2)
    current_rounded = round(current, 2)
    delta_rounded = round(current_rounded - previous_rounded, 2)
    percent = (delta_rounded / previous_rounded * 100.0) if previous_rounded else 0.0

    return PriceChangeInfo(
        previous_amount=previous_rounded,
        current_amount=current_rounded,
        delta_amount=delta_rounded,
        percent_change=round(percent, 1),
        period_label=PERIOD_LABEL.get(cadence, "the previous charge"),
    )
