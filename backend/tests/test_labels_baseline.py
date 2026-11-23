"""Behavior to preserve when JSONB labels move to household associations.

Keep ordinary-name expectations through cutover; adapt only the seeding helper.
Normalization cases in fixtures/labels_migration.json deliberately change legacy
representation and will feed the migration round-trip/preflight tests.
"""

import json
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.models import Dashboard, DashboardPanel, Household, Report, Transaction, User
from app.utils.labels import replace_transaction_labels
from app.utils.query_builder import (
    build_expenses_filter,
    build_filter_groups_clause,
    build_panel_data_query,
    build_stats_filter,
    counted_amount,
)
from app.utils.transfer_groups import create_group

HOUSEHOLD = "household-default"
FIXTURES = Path(__file__).parent / "fixtures" / "labels_migration.json"


@pytest.fixture
async def label_baseline(client, db_session):
    """Seed two tenants, duplicate labels, partial refunds and user transfers."""
    db_session.add(Household(id="labels-foreign", name="Foreign"))
    db_session.add(User(id="labels-bob", name="Bob", household_id=HOUSEHOLD))
    await db_session.flush()
    rows = [
        ("multi", "10.10", "expense", ["Flight", "Hotel", "Flight"]),
        ("case", "20.20", "expense", ["flight"]),
        ("empty", "30.30", "expense", []),
        ("excluded", "40.40", "expense", ["Flight"]),
        ("purchase", "100.00", "expense", ["Flight", "Hotel"]),
        ("refund", "30.00", "income", ["Hotel"]),
        ("user-out", "50.00", "expense", ["Flight"]),
        ("user-in", "50.00", "income", ["Flight"]),
        ("foreign", "999.99", "expense", ["Flight", "ForeignOnly"]),
    ]
    for index, (name, amount, kind, _names) in enumerate(rows, 1):
        db_session.add(
            Transaction(
                id=f"labels-{name}",
                date=date(2024, 1, index),
                description=f"Synthetic row {index}",
                category="Travel",
                amount=Decimal(amount),
                type=kind,
                household_id="labels-foreign" if name == "foreign" else HOUSEHOLD,
                created_by_user_id=(
                    None
                    if name == "foreign"
                    else "labels-bob"
                    if name == "user-in"
                    else "default-user"
                ),
                excluded_from_calculations=name == "excluded",
            )
        )
    await db_session.flush()
    for household in (HOUSEHOLD, "labels-foreign"):
        await replace_transaction_labels(
            db_session,
            household,
            {
                f"labels-{name}": labels
                for name, _, _, labels in rows
                if (household == "labels-foreign") == (name == "foreign")
            },
        )
    await create_group(db_session, HOUSEHOLD, "labels-purchase", ["labels-refund"])
    await create_group(db_session, HOUSEHOLD, "labels-user-in", ["labels-user-out"])

    references = json.loads(FIXTURES.read_text())["saved_references"]
    db_session.add(
        Report(id="labels-report", name="Labels", filters=references["report"])
    )
    db_session.add(
        Dashboard(
            id="labels-dashboard",
            name="Labels",
            date_range_start=date(2024, 1, 1),
            date_range_end=date(2024, 1, 31),
        )
    )
    await db_session.flush()
    db_session.add(
        DashboardPanel(
            id="labels-panel",
            dashboard_id="labels-dashboard",
            title="Labels",
            chart_type="bar",
            filter_groups=references["panel"],
        )
    )
    await db_session.flush()


def _labels(operator, values):
    return {"field": "labels", "operator": operator, "value": values}


@pytest.mark.parametrize(
    ("params", "expected"),
    [
        (
            {"labels": ["Flight", "Hotel"]},
            {"multi", "excluded", "purchase", "refund", "user-in", "user-out"},
        ),
        ({"labels": ["flight"]}, {"case"}),
        ({"labels": ["FLIGHT"]}, set()),
        ({"labels": ["unknown"]}, set()),
        (
            {"labels": []},
            {
                "multi",
                "case",
                "empty",
                "excluded",
                "purchase",
                "refund",
                "user-in",
                "user-out",
            },
        ),
        (
            {"search": "fLiGh"},
            {"multi", "case", "excluded", "purchase", "user-in", "user-out"},
        ),
        ({"search": "ForeignOnly"}, set()),
    ],
)
async def test_expense_label_matching(label_baseline, db_session, params, expected):
    ids = (
        (
            await db_session.execute(
                select(Transaction.id).where(
                    Transaction.household_id == HOUSEHOLD,
                    *build_expenses_filter(params),
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(ids) == len(expected)
    assert set(ids) == {f"labels-{name}" for name in expected}


@pytest.mark.parametrize(
    ("groups", "expected"),
    [
        (
            [{"conditions": [_labels("includes", ["Flight", "Hotel"])]}],
            {"multi", "excluded", "purchase", "refund", "user-in", "user-out"},
        ),
        (
            [{"conditions": [_labels("excludes", ["Flight", "Hotel"])]}],
            {"case", "empty"},
        ),
        (
            [
                {
                    "conditions": [
                        _labels("includes", ["Flight"]),
                        _labels("includes", ["Hotel"]),
                    ]
                }
            ],
            {"multi", "purchase"},
        ),
        (
            [
                {"conditions": [_labels("includes", ["Hotel"])]},
                {"conditions": [_labels("includes", ["flight"])]},
            ],
            {"multi", "purchase", "refund", "case"},
        ),
        (
            [{"conditions": [_labels("excludes", ["unknown"])]}],
            {
                "multi",
                "case",
                "empty",
                "excluded",
                "purchase",
                "refund",
                "user-in",
                "user-out",
            },
        ),
    ],
)
async def test_group_label_matching(label_baseline, db_session, groups, expected):
    ids = (
        (
            await db_session.execute(
                select(Transaction.id).where(
                    Transaction.household_id == HOUSEHOLD,
                    build_filter_groups_clause(groups),
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(ids) == len(expected)
    assert set(ids) == {f"labels-{name}" for name in expected}


@pytest.mark.parametrize(
    ("user", "expected_ids", "expected_total"),
    [
        (None, {"multi", "purchase"}, "80.10"),
        ("default-user", {"multi", "purchase", "user-out"}, "130.10"),
    ],
)
async def test_label_accounting_counts_each_row_once(
    label_baseline, db_session, user, expected_ids, expected_total
):
    groups = [{"conditions": [_labels("includes", ["Flight", "Hotel"])]}]
    filters = [
        Transaction.household_id == HOUSEHOLD,
        *build_stats_filter("2024-01-01", "2024-01-31", user),
        build_filter_groups_clause(groups),
    ]
    ids = set(
        (await db_session.execute(select(Transaction.id).where(*filters))).scalars()
    )
    assert ids == {f"labels-{name}" for name in expected_ids}
    total = (
        await db_session.execute(select(func.sum(counted_amount(user))).where(*filters))
    ).scalar_one()
    assert total == Decimal(expected_total)
    statement, _ = build_panel_data_query("2024-01-01", "2024-01-31", user, groups)
    rows = (
        await db_session.execute(statement.where(Transaction.household_id == HOUSEHOLD))
    ).all()
    assert [(row.sort_month, row.type, row.total) for row in rows] == [
        ("2024-01", "expense", Decimal(expected_total))
    ]


async def test_label_pagination_and_vocabulary(label_baseline, client):
    response = await client.get(
        "/api/expenses", params={"labels": "Flight,Hotel", "limit": 2}
    )
    assert response.status_code == 200
    assert response.json()["total"] == 6
    assert [row["id"] for row in response.json()["expenses"]] == [
        "labels-user-in",
        "labels-user-out",
    ]
    second = await client.get(
        "/api/expenses", params={"labels": "Flight,Hotel", "limit": 2, "offset": 2}
    )
    assert second.json()["total"] == 6
    assert [row["id"] for row in second.json()["expenses"]] == [
        "labels-refund",
        "labels-purchase",
    ]
    vocabulary = await client.get("/api/labels")
    assert vocabulary.status_code == 200
    # Legacy ordering follows the database collation. Phase 1 explicitly
    # changes it to Python string order; membership must remain identical.
    assert set(vocabulary.json()["labels"]) == {"Flight", "Hotel", "flight"}
