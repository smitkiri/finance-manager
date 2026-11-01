"""Month math and spending queries for household budgets."""

import re
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.budget import Budget
from app.models.transaction import Transaction
from app.utils.query_builder import build_stats_filter, counted_amount

_MONTH_RE = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")


def parse_month(value: str) -> date:
    """'YYYY-MM' -> the first day of that month. Raises ValueError."""
    match = _MONTH_RE.match(value)
    if not match:
        raise ValueError(f"Invalid month: {value!r}")
    return date(int(match.group(1)), int(match.group(2)), 1)


def format_month(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def _add_months(d: date, delta: int) -> date:
    index = d.year * 12 + (d.month - 1) + delta
    return date(index // 12, index % 12 + 1, 1)


def month_window(end: date, count: int) -> list[date]:
    """`count` month starts ending at `end`, oldest first."""
    return [_add_months(end, -i) for i in range(count - 1, -1, -1)]


def month_end(month: date) -> date:
    """The last day of `month`."""
    return date.fromordinal(_add_months(month, 1).toordinal() - 1)


def resolve_limit(versions: list[Budget], month: date) -> Decimal | None:
    """The limit in effect for `month`: the latest version on or before it."""
    in_effect = [v for v in versions if v.effective_month <= month]
    if not in_effect:
        return None
    return max(in_effect, key=lambda v: v.effective_month).amount


def _as_date(value: datetime | date) -> date:
    return value.date() if isinstance(value, datetime) else value


async def monthly_actuals(
    db: AsyncSession, household_id: str, start: date, end_inclusive: date
) -> dict[tuple[str, date], float]:
    """(category, month start) -> expense total, counted the way /api/stats is."""
    rows = (
        await db.execute(
            select(
                Transaction.category,
                func.date_trunc("month", Transaction.date).label("month_start"),
                func.sum(func.abs(counted_amount(None))).label("total"),
            )
            .where(
                Transaction.household_id == household_id,
                Transaction.type == "expense",
                *build_stats_filter(start.isoformat(), end_inclusive.isoformat(), None),
            )
            # GROUP BY position avoids duplicate bind params for date_trunc
            .group_by(text("1, 2"))
        )
    ).all()
    return {(row.category, _as_date(row.month_start)): float(row.total) for row in rows}


async def months_with_data(
    db: AsyncSession, household_id: str, start: date, end_inclusive: date
) -> set[date]:
    """Month starts that have at least one counted transaction of any type."""
    rows = (
        await db.execute(
            select(func.date_trunc("month", Transaction.date).label("month_start"))
            .where(
                Transaction.household_id == household_id,
                *build_stats_filter(start.isoformat(), end_inclusive.isoformat(), None),
            )
            .group_by(text("1"))
        )
    ).all()
    return {_as_date(row.month_start) for row in rows}
