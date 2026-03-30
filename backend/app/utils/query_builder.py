"""
SQLAlchemy ORM filter builders.

Ports the Express query builder functions from legacy/helpers/queryBuilders.js
into SQLAlchemy filter clauses.
"""

from datetime import date as date_type

from sqlalchemy import Text, and_, cast, exists, func, or_, select, text
from sqlalchemy.dialects.postgresql import JSONB

from app.models.transaction import Transaction


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
        filters.append(Transaction.user_id == params["userId"])

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


def build_stats_filter(
    date_from: str | None,
    date_to: str | None,
    user_id: str | None,
) -> list:
    """Build SQLAlchemy filter clauses for stats queries.

    Mirrors buildStatsWhereClause() in legacy/helpers/queryBuilders.js.
    Excludes excluded_from_calculations records and handles complex
    transfer_info filtering logic.
    """
    filters = []

    if date_from:
        filters.append(Transaction.date >= _parse_date(date_from))
    if date_to:
        filters.append(Transaction.date <= _parse_date(date_to))
    if user_id:
        filters.append(Transaction.user_id == user_id)

    # Exclude records marked as excluded from calculations
    filters.append(Transaction.excluded_from_calculations.is_not(True))

    # Complex transfer filtering logic — mirrors the Express SQL:
    # Include if:
    #   - Not a transfer at all, OR
    #   - Has user override and not excluded from calculations, OR
    #   - Is "user" type transfer and userId is specified, OR
    #   - Is "self" type transfer and not excluded from calculations, OR
    #   - Has no/unknown transfer type and not excluded from calculations
    ti = Transaction.transfer_info
    is_not_transfer = or_(
        ti.is_(None),
        ti["isTransfer"].astext.is_distinct_from("true"),
    )

    ti_excluded = text(
        "COALESCE((transfer_info->>'excludedFromCalculations')::boolean, false) = false"
    )

    has_override_included = and_(
        ti["userOverride"].astext == "true",
        ti_excluded,
    )

    # For user-type transfers: include only when userId filter is active
    if user_id is not None:
        is_user_transfer_with_userid = and_(
            ti["transferType"].astext == "user",
        )
    else:
        # When no userId specified, user-type transfers are not included via this branch
        is_user_transfer_with_userid = and_(
            ti["transferType"].astext == "user",
            text("false"),
        )

    is_self_not_excluded = and_(
        ti["transferType"].astext == "self",
        ti_excluded,
    )

    is_other_not_excluded = and_(
        or_(
            ti["transferType"].astext.is_(None),
            ti["transferType"].astext.not_in(["user", "self"]),
        ),
        ti_excluded,
    )

    filters.append(
        or_(
            is_not_transfer,
            has_override_included,
            is_user_transfer_with_userid,
            is_self_not_excluded,
            is_other_not_excluded,
        )
    )

    return filters
