from datetime import date
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.import_session import ImportSession
from app.models.transaction import Transaction


class TestExportCsv:
    async def test_export_csv_with_data(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        db_session.add(
            Transaction(
                id="t1",
                date=date(2024, 1, 15),
                description="Coffee",
                category="Food",
                amount=Decimal("4.50"),
                type="expense",
                created_by_user_id="user1",
            )
        )
        await db_session.flush()

        response = await client.get("/api/export-csv")
        assert response.status_code == 200
        assert response.headers["content-type"] == "text/csv; charset=utf-8"
        lines = response.text.strip().split("\n")
        assert lines[0] == "Date,Description,Category,Amount,Type"
        assert "Coffee" in lines[1]

    async def test_export_csv_empty(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        response = await client.get("/api/export-csv")
        assert response.status_code == 404


class TestColumnMappings:
    async def test_get_empty_mappings(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        response = await client.get("/api/column-mappings")
        assert response.status_code == 200
        assert response.json() == []

    async def test_save_and_get_mapping(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        mapping = {
            "name": "Test Bank",
            "mappings": [
                {
                    "csvColumn": "Date",
                    "standardColumn": "Transaction Date",
                }
            ],
        }
        response = await client.post("/api/column-mappings", json={"mapping": mapping})
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["count"] == 1

        response = await client.get("/api/column-mappings")
        assert response.status_code == 200
        mappings = response.json()
        assert len(mappings) == 1
        assert mappings[0]["name"] == "Test Bank"

    async def test_save_multiple_mappings(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        mapping1 = {"name": "Bank A", "mappings": []}
        mapping2 = {"name": "Bank B", "mappings": []}

        await client.post("/api/column-mappings", json={"mapping": mapping1})
        response = await client.post("/api/column-mappings", json={"mapping": mapping2})
        assert response.json()["count"] == 2


class TestImportCsv:
    async def test_basic_import(self, client: AsyncClient, db_session: AsyncSession):
        csv_text = (
            "Date,Description,Category,Amount\n"
            "2024-01-15,Coffee Shop,Food,-4.50\n"
            "2024-01-16,Salary,Income,3000.00\n"
        )
        response = await client.post("/api/import-csv", json={"csvText": csv_text})
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["imported"] == 2
        assert data["added"] == 2
        assert data["total"] == 2
        assert "sessionId" in data
        assert "transfersDetected" in data

    async def test_import_creates_session(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        csv_text = "Date,Description,Category,Amount\n2024-01-15,Coffee,Food,-4.50\n"
        response = await client.post(
            "/api/import-csv",
            json={"csvText": csv_text, "fileName": "test.csv"},
        )
        session_id = response.json()["sessionId"]

        result = await db_session.execute(
            ImportSession.__table__.select().where(ImportSession.id == session_id)
        )
        session = result.first()
        assert session is not None
        assert session.file_name == "test.csv"

    async def test_import_deduplicates(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        # Pre-populate a transaction
        db_session.add(
            Transaction(
                id="existing1",
                date=date(2024, 1, 15),
                description="Coffee Shop",
                category="Food",
                amount=Decimal("4.50"),
                type="expense",
                created_by_user_id="user1",
            )
        )
        await db_session.flush()

        csv_text = (
            "Date,Description,Category,Amount\n"
            "2024-01-15,Coffee Shop,Food,-4.50\n"
            "2024-01-16,Tea,Food,-3.00\n"
        )
        response = await client.post("/api/import-csv", json={"csvText": csv_text})
        data = response.json()
        assert data["added"] == 1  # Only Tea is new
        assert data["total"] == 2  # Coffee (existing) + Tea


class TestImportWithMapping:
    async def test_basic_import_with_mapping(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        csv_text = "Trans Date,Desc,Amt\n2024-01-15,Coffee Shop,-4.50\n"
        body = {
            "csvText": csv_text,
            "userId": "user1",
            "mapping": {
                "id": "src1",
                "name": "Test Bank",
                "flipIncomeExpense": False,
                "mappings": [
                    {
                        "csvColumn": "Trans Date",
                        "standardColumn": "Transaction Date",
                    },
                    {
                        "csvColumn": "Desc",
                        "standardColumn": "Description",
                    },
                    {
                        "csvColumn": "Amt",
                        "standardColumn": "Amount",
                    },
                ],
            },
        }
        response = await client.post("/api/import-with-mapping", json=body)
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["imported"] == 1
        assert "autoFilledCategories" in data
        assert "sessionId" in data

    async def test_import_with_mapping_us_date_format(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        """Bank CSVs commonly use MM/DD/YYYY dates — must be accepted."""
        csv_text = "Trans Date,Desc,Amt\n04/30/2026,Coffee Shop,-4.50\n"
        body = {
            "csvText": csv_text,
            "userId": "user1",
            "mapping": {
                "id": "src1",
                "name": "Test Bank",
                "flipIncomeExpense": False,
                "mappings": [
                    {"csvColumn": "Trans Date", "standardColumn": "Transaction Date"},
                    {"csvColumn": "Desc", "standardColumn": "Description"},
                    {"csvColumn": "Amt", "standardColumn": "Amount"},
                ],
            },
        }
        response = await client.post("/api/import-with-mapping", json=body)
        assert response.status_code == 200
        assert response.json()["imported"] == 1

        result = await db_session.execute(Transaction.__table__.select())
        rows = result.all()
        assert len(rows) == 1
        assert rows[0].date == date(2026, 4, 30)

    async def test_import_with_mapping_us_dates_run_transfer_detection(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        """Importing US-format dates against existing data from a different
        source must not crash transfer detection."""
        db_session.add(
            Transaction(
                id="existing1",
                date=date(2026, 4, 28),
                description="Outgoing Transfer",
                category="Transfer",
                amount=Decimal("100.00"),
                type="expense",
                created_by_user_id="user1",
                metadata_={"sourceId": "src_other"},
            )
        )
        await db_session.flush()

        csv_text = "Trans Date,Desc,Amt\n04/29/2026,Incoming Transfer,100.00\n"
        body = {
            "csvText": csv_text,
            "userId": "user1",
            "mapping": {
                "id": "src1",
                "name": "Test Bank",
                "flipIncomeExpense": False,
                "mappings": [
                    {"csvColumn": "Trans Date", "standardColumn": "Transaction Date"},
                    {"csvColumn": "Desc", "standardColumn": "Description"},
                    {"csvColumn": "Amt", "standardColumn": "Amount"},
                ],
            },
        }
        response = await client.post("/api/import-with-mapping", json=body)
        assert response.status_code == 200
        assert response.json()["imported"] == 1

    async def test_import_with_mapping_requires_user_id(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        """The Pydantic schema enforces userId is required."""
        response = await client.post(
            "/api/import-with-mapping",
            json={
                "csvText": "a,b\n1,2",
                "mapping": {"name": "x", "mappings": []},
            },
        )
        assert response.status_code == 422  # Pydantic validation error

    async def test_import_with_mapping_sets_source_metadata(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        csv_text = "Date,Description,Amount\n2024-01-15,Coffee,-4.50\n"
        body = {
            "csvText": csv_text,
            "userId": "user1",
            "mapping": {
                "id": "src1",
                "name": "Chase",
                "flipIncomeExpense": False,
                "mappings": [
                    {
                        "csvColumn": "Date",
                        "standardColumn": "Transaction Date",
                    },
                    {
                        "csvColumn": "Description",
                        "standardColumn": "Description",
                    },
                    {
                        "csvColumn": "Amount",
                        "standardColumn": "Amount",
                    },
                ],
            },
        }
        response = await client.post("/api/import-with-mapping", json=body)
        session_id = response.json()["sessionId"]

        result = await db_session.execute(
            ImportSession.__table__.select().where(ImportSession.id == session_id)
        )
        session = result.first()
        assert session is not None
        assert session.source_id == "src1"
        assert session.source_name == "Chase"
