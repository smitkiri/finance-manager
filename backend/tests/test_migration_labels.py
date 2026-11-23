"""PostgreSQL backfill/preflight rollback and normalized downgrade round trips."""

import json
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text

from tests.conftest import get_test_sync_db_url

PREVIOUS = "f2a8d4c6e1b9"
CURRENT = "a7b9c2d4e6f8"
DATA = json.loads(
    (Path(__file__).parent / "fixtures/labels_migration.json").read_text()
)
HOUSEHOLDS = ["labmig-a", "labmig-b"]


@pytest.fixture
def legacy_database(alembic_runner):
    alembic_runner.upgrade("head")
    alembic_runner.downgrade(PREVIOUS)
    engine = create_engine(get_test_sync_db_url())
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO households (id,name) VALUES "
                "('labmig-a','A'),('labmig-b','B')"
            )
        )
    try:
        yield engine, alembic_runner
    finally:
        # Repair all deliberately invalid fixtures before returning to head.
        with engine.begin() as connection:
            connection.execute(
                text("DELETE FROM dashboards WHERE household_id = ANY(:ids)"),
                {"ids": HOUSEHOLDS},
            )
            connection.execute(
                text("DELETE FROM reports WHERE household_id = ANY(:ids)"),
                {"ids": HOUSEHOLDS},
            )
            connection.execute(
                text("DELETE FROM transactions WHERE household_id = ANY(:ids)"),
                {"ids": HOUSEHOLDS},
            )
            if connection.scalar(text("SELECT to_regclass('labels')")):
                connection.execute(
                    text("DELETE FROM labels WHERE household_id = ANY(:ids)"),
                    {"ids": HOUSEHOLDS},
                )
            connection.execute(
                text("DELETE FROM households WHERE id = ANY(:ids)"), {"ids": HOUSEHOLDS}
            )
        alembic_runner.upgrade("head")
        engine.dispose()


def seed_transaction(connection, row_id, value, household="labmig-a", sql_null=False):
    connection.execute(
        text("""
        INSERT INTO transactions
            (id,date,description,category,amount,type,household_id,labels)
        VALUES (:id, '2024-01-01', 'synthetic', 'Travel', 12.34, 'expense', :hid,
                CAST(:labels AS jsonb))
    """),
        {
            "id": f"labmig-{row_id}",
            "hid": household,
            "labels": None if sql_null else json.dumps(value),
        },
    )


def attached_names(connection):
    result = {
        row.id: []
        for row in connection.execute(
            text("SELECT id FROM transactions WHERE household_id = ANY(:ids)"),
            {"ids": HOUSEHOLDS},
        )
    }
    for row in connection.execute(
        text("""
        SELECT tl.transaction_id, l.name FROM transaction_labels tl
        JOIN transactions t ON t.id = tl.transaction_id
        JOIN labels l ON l.id = tl.label_id
        WHERE t.household_id = ANY(:ids)
    """),
        {"ids": HOUSEHOLDS},
    ):
        result[row.transaction_id].append(row.name)
    return {key: sorted(names) for key, names in result.items()}


def test_labels_upgrade_downgrade_reupgrade(legacy_database):
    engine, runner = legacy_database
    with engine.begin() as connection:
        for case in DATA["normalization"]:
            seed_transaction(
                connection,
                case["id"],
                case["legacy"],
                sql_null=case.get("sql_null", False),
            )
        seed_transaction(connection, "foreign", ["Flight"], household="labmig-b")
        refs = DATA["saved_references"]
        connection.execute(
            text("""
            INSERT INTO reports (id,name,household_id,filters)
            VALUES ('labmig-report','Synthetic','labmig-a',CAST(:filters AS jsonb))
        """),
            {"filters": json.dumps(refs["report"])},
        )
        connection.execute(
            text("""
            INSERT INTO dashboards
                (id,name,household_id,date_range_start,date_range_end)
            VALUES ('labmig-dashboard','Synthetic','labmig-a','2024-01-01','2024-01-31')
        """)
        )
        connection.execute(
            text("""
            INSERT INTO dashboard_panels
                (id,dashboard_id,title,chart_type,filter_groups)
            VALUES ('labmig-panel','labmig-dashboard','Synthetic','bar',
                    CAST(:filters AS jsonb))
        """),
            {"filters": json.dumps(refs["panel"])},
        )
    runner.upgrade("head")
    expected = {
        f"labmig-{case['id']}": case["expected"] for case in DATA["normalization"]
    }
    expected["labmig-foreign"] = ["Flight"]
    with engine.connect() as connection:
        assert attached_names(connection) == expected
        assert not connection.scalar(
            text("""
            SELECT count(*) FROM information_schema.columns
            WHERE table_name='transactions' AND column_name='labels'
        """)
        )
        definitions = connection.execute(
            text(
                "SELECT id, household_id, name, created_by FROM labels "
                "WHERE household_id=ANY(:ids)"
            ),
            {"ids": HOUSEHOLDS},
        ).all()
        assert len([row for row in definitions if row.name == "Flight"]) == 2
        assert all(
            row.created_by == "user" and row.id != row.name for row in definitions
        )
        assert "Unused" not in {row.name for row in definitions}
        assert (
            connection.scalar(
                text("SELECT filters FROM reports WHERE id='labmig-report'")
            )
            == refs["normalized_report"]
        )
        assert (
            connection.scalar(
                text(
                    "SELECT filter_groups FROM dashboard_panels WHERE id='labmig-panel'"
                )
            )
            == refs["normalized_panel"]
        )
    runner.downgrade(PREVIOUS)
    with engine.connect() as connection:
        legacy = {
            row.id: sorted(row.labels)
            for row in connection.execute(
                text(
                    "SELECT id, labels FROM transactions WHERE household_id=ANY(:ids)"
                ),
                {"ids": HOUSEHOLDS},
            )
        }
        assert legacy == expected
        assert connection.scalar(text("SELECT to_regclass('labels')")) is None
    runner.upgrade("head")
    with engine.connect() as connection:
        assert attached_names(connection) == expected


@pytest.mark.parametrize("case", DATA["malformed"], ids=lambda case: case["id"])
def test_malformed_historical_labels_rollback(legacy_database, case):
    engine, runner = legacy_database
    with engine.begin() as connection:
        seed_transaction(connection, case["id"], case["legacy"])
    with pytest.raises(
        ValueError, match=case.get("error_match", "transactions.labels: 1 malformed")
    ) as error:
        runner.upgrade("head")
    assert f"labmig-{case['id']}" in str(error.value)
    assert "synthetic" not in str(error.value)
    with engine.connect() as connection:
        assert (
            connection.scalar(text("SELECT version_num FROM alembic_version"))
            == PREVIOUS
        )
        assert connection.scalar(text("SELECT to_regclass('labels')")) is None
        assert (
            connection.scalar(text("SELECT to_regclass('transaction_labels')")) is None
        )
        assert (
            connection.scalar(
                text("SELECT labels FROM transactions WHERE id=:id"),
                {"id": f"labmig-{case['id']}"},
            )
            == case["legacy"]
        )


@pytest.mark.parametrize("filters", DATA["malformed_saved_references"]["reports"])
def test_malformed_report_filter_preflight(legacy_database, filters):
    engine, runner = legacy_database
    with engine.begin() as connection:
        seed_transaction(connection, "valid", ["Flight"])
        connection.execute(
            text("""
            INSERT INTO reports (id,name,household_id,filters)
            VALUES ('labmig-bad-report','Synthetic','labmig-a',CAST(:filters AS jsonb))
        """),
            {"filters": json.dumps(filters)},
        )
    with pytest.raises(ValueError, match="reports.filters: 1 malformed"):
        runner.upgrade("head")
    with engine.connect() as connection:
        assert (
            connection.scalar(text("SELECT version_num FROM alembic_version"))
            == PREVIOUS
        )
        assert connection.scalar(text("SELECT to_regclass('labels')")) is None


@pytest.mark.parametrize("filters", DATA["malformed_saved_references"]["panels"])
def test_malformed_panel_filter_preflight(legacy_database, filters):
    engine, runner = legacy_database
    with engine.begin() as connection:
        connection.execute(
            text("""
            INSERT INTO dashboards
                (id,name,household_id,date_range_start,date_range_end)
            VALUES ('labmig-dashboard','Synthetic','labmig-a','2024-01-01','2024-01-31')
        """)
        )
        connection.execute(
            text("""
            INSERT INTO dashboard_panels
                (id,dashboard_id,title,chart_type,filter_groups)
            VALUES ('labmig-panel','labmig-dashboard','Synthetic','bar',
                    CAST(:filters AS jsonb))
        """),
            {"filters": json.dumps(filters)},
        )
    with pytest.raises(ValueError, match="dashboard_panels.filter_groups: 1 malformed"):
        runner.upgrade("head")
    with engine.connect() as connection:
        assert (
            connection.scalar(text("SELECT version_num FROM alembic_version"))
            == PREVIOUS
        )
        assert connection.scalar(text("SELECT to_regclass('labels')")) is None
