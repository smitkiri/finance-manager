"""
SQLAlchemy ORM filter builders.

Ports the Express query builder functions from legacy/helpers/queryBuilders.js
into SQLAlchemy filter clauses.
"""

from datetime import date as date_type

from sqlalchemy import Text, and_, case, cast, exists, func, or_, select, text
from sqlalchemy.dialects.postgresql import JSONB

from app.models.transaction import Transaction
from app.models.transfer_group import TransferGroup


def build_panel_data_query(
    date_from: str | None,
    date_to: str | None,
    user_id: str | None,
    filter_groups: list[dict] | None,
):
    """Build a monthly aggregate query for a dashboard panel.

    Combines build_stats_filter + build_filter_groups_clause into a query
    that groups transactions by month and type, summing amounts.

    Returns (statement, filters) where statement is a select() for
    sort_month, month display name, type, and total amount.
    """
    filters = build_stats_filter(date_from, date_to, user_id)

    fg_clause = build_filter_groups_clause(filter_groups)
    if fg_clause is not None:
        filters.append(fg_clause)

    stmt = (
        select(
            func.to_char(func.date_trunc("month", Transaction.date), "YYYY-MM").label(
                "sort_month"
            ),
            func.to_char(Transaction.date, "Mon YYYY").label("month"),
            Transaction.type,
            func.sum(counted_amount(user_id)).label("total"),
        )
        .where(*filters)
        .group_by(
            text("sort_month"),
            text("month"),
            Transaction.type,
        )
        .order_by(text("sort_month"))
    )

    return stmt, filters


def _parse_date(d: str) -> date_type:
    return date_type.fromisoformat(str(d)[:10])


def build_expenses_filter(params: dict) -> list:
    """Build SQLAlchemy filter clauses from query parameters.

    Mirrors buildExpensesWhereClause() in legacy/helpers/queryBuilders.js.
    Returns a list of filter clauses to pass to stmt.where(*filters).
    """
    filters = []

    if params.get("dateFrom"):
        filters.append(Transaction.date >= _parse_date(params["dateFrom"]))

    if params.get("dateTo"):
        filters.append(Transaction.date <= _parse_date(params["dateTo"]))

    if params.get("userId"):
        filters.append(Transaction.created_by_user_id == params["userId"])

    categories = params.get("categories")
    if categories and len(categories) > 0:
        filters.append(Transaction.category.in_(categories))

    types = params.get("types")
    if types and len(types) > 0:
        filters.append(Transaction.type.in_(types))

    min_amount = params.get("minAmount")
    if min_amount is not None and min_amount != "":
        filters.append(Transaction.amount >= float(min_amount))

    max_amount = params.get("maxAmount")
    if max_amount is not None and max_amount != "":
        filters.append(Transaction.amount <= float(max_amount))

    search = params.get("search")
    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        label_subq = (
            select(text("1"))
            .select_from(
                func.jsonb_array_elements_text(
                    func.coalesce(Transaction.labels, cast("[]", JSONB))
                ).alias("lbl")
            )
            .where(func.lower(text("lbl")).like(term))
            .correlate(Transaction)
        )
        filters.append(
            or_(
                func.lower(Transaction.description).like(term),
                func.lower(Transaction.category).like(term),
                exists(label_subq),
            )
        )

    labels = params.get("labels")
    if labels and len(labels) > 0:
        label_subq = (
            select(text("1"))
            .select_from(
                func.jsonb_array_elements_text(
                    func.coalesce(Transaction.labels, cast("[]", JSONB))
                ).alias("lbl")
            )
            .where(cast(text("lbl"), Text).in_(labels))
            .correlate(Transaction)
        )
        filters.append(exists(label_subq))

    sources = params.get("sources")
    if sources and len(sources) > 0:
        filters.append(Transaction.metadata_["sourceId"].astext.in_(sources))

    return filters


def counted_amount(user_id: str | None):
    """SQL expression for the amount a transaction contributes to totals.

    `effective_amount` is the persisted transfer-group allocation (NULL means
    "counts in full"). When the view is filtered to one user, transfers
    between household members count in full, as they did before groups.
    """
    base = func.coalesce(Transaction.effective_amount, Transaction.amount)
    if not user_id:
        return base
    is_user_group = exists().where(
        TransferGroup.id == Transaction.transfer_group_id,
        TransferGroup.kind == "user",
    )
    return case((is_user_group, Transaction.amount), else_=base)


def build_stats_filter(
    date_from: str | None,
    date_to: str | None,
    user_id: str | None,
) -> list:
    """Build SQLAlchemy filter clauses for stats queries.

    Excludes manually excluded rows and rows whose counted amount is zero
    (fully offset by a transfer/refund group).
    """
    filters = []

    if date_from:
        filters.append(Transaction.date >= _parse_date(date_from))
    if date_to:
        filters.append(Transaction.date <= _parse_date(date_to))
    if user_id:
        filters.append(Transaction.created_by_user_id == user_id)

    filters.append(Transaction.excluded_from_calculations.is_not(True))
    filters.append(counted_amount(user_id) != 0)

    return filters


def build_filter_groups_clause(filter_groups: list[dict] | None):
    """Build SQLAlchemy filter clause from filter groups.

    Groups are OR'd together; conditions within a group are AND'd.
    Returns a single SQLAlchemy clause element, or None if no filters.

    Mirrors buildFilterGroupsWhereClause() in legacy/helpers/queryBuilders.js.
    """
    if not filter_groups:
        return None

    group_clauses = []

    for group in filter_groups:
        conditions = group.get("conditions", [])
        if not conditions:
            continue

        cond_clauses = []
        for cond in conditions:
            field = cond.get("field")
            operator = cond.get("operator")
            value = cond.get("value")

            if field == "type" and operator == "is" and value:
                cond_clauses.append(Transaction.type == value)

            elif field == "category" and isinstance(value, list) and len(value) > 0:
                if operator == "is":
                    cond_clauses.append(Transaction.category.in_(value))
                else:  # "not"
                    cond_clauses.append(Transaction.category.not_in(value))

            elif field == "labels" and isinstance(value, list) and len(value) > 0:
                label_subq = (
                    select(text("1"))
                    .select_from(
                        func.jsonb_array_elements_text(
                            func.coalesce(Transaction.labels, cast("[]", JSONB))
                        ).alias("lbl")
                    )
                    .where(cast(text("lbl"), Text).in_(value))
                    .correlate(Transaction)
                )
                if operator == "excludes":
                    cond_clauses.append(~exists(label_subq))
                else:  # "includes"
                    cond_clauses.append(exists(label_subq))

            elif (
                field == "description"
                and operator in ("matches", "not_matches")
                and value
            ):
                match_clause = Transaction.description.regexp_match(value, "i")
                if operator == "not_matches":
                    cond_clauses.append(~match_clause)
                else:
                    cond_clauses.append(match_clause)

            elif field == "amount" and value is not None and value != "":
                if operator == "gte":
                    cond_clauses.append(Transaction.amount >= float(value))
                else:  # "lte"
                    cond_clauses.append(Transaction.amount <= float(value))

        if cond_clauses:
            group_clauses.append(and_(*cond_clauses))

    if not group_clauses:
        return None

    if len(group_clauses) == 1:
        return group_clauses[0]
    return or_(*group_clauses)


def build_month_series(date_from: str, date_to: str) -> dict[str, dict]:
    """Generate a month map pre-populated with every month in [date_from, date_to].

    Keys are "YYYY-MM", values are {"month": "Mon YYYY"}.
    Mirrors buildMonthSeries() in legacy/helpers/queryBuilders.js.
    """
    month_names = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
    ]

    start = date_type.fromisoformat(date_from[:10]).replace(day=1)
    end = date_type.fromisoformat(date_to[:10]).replace(day=1)

    result = {}
    current = start
    while current <= end:
        key = current.strftime("%Y-%m")
        display = f"{month_names[current.month - 1]} {current.year}"
        result[key] = {"month": display}
        if current.month == 12:
            current = current.replace(year=current.year + 1, month=1)
        else:
            current = current.replace(month=current.month + 1)

    return result
