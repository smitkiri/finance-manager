from datetime import date, datetime, timedelta
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.import_session import ImportSession
from app.models.transaction import Transaction


class TestGetImportSessions:
    async def test_empty_list(self, client: AsyncClient, db_session: AsyncSession):
        response = await client.get("/api/import-sessions")
        assert response.status_code == 200
        assert response.json() == []

    async def test_returns_sessions(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        db_session.add(
            ImportSession(
                id="sess1",
                created_by_user_id="user1",
                source_name="test.csv",
                file_name="test.csv",
                transaction_count=5,
            )
        )
        await db_session.flush()

        response = await client.get("/api/import-sessions")
        data = response.json()
        assert len(data) == 1
        assert data[0]["id"] == "sess1"
        assert data[0]["sourceName"] == "test.csv"
        assert data[0]["transactionCount"] == 5
        # camelCase keys
        assert "createdAt" in data[0]
        assert "userId" in data[0]

    async def test_auto_cleans_old_sessions(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        old_date = datetime.now() - timedelta(days=200)
        db_session.add(
            ImportSession(
                id="old_sess",
                source_name="old.csv",
                transaction_count=1,
                created_at=old_date,
            )
        )
        db_session.add(
            ImportSession(
                id="new_sess",
                source_name="new.csv",
                transaction_count=2,
            )
        )
        await db_session.flush()

        response = await client.get("/api/import-sessions")
        data = response.json()
        assert len(data) == 1
        assert data[0]["id"] == "new_sess"


class TestDeleteImportSession:
    async def test_delete_session_and_transactions(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        db_session.add(
            ImportSession(
                id="sess1",
                source_name="test.csv",
                transaction_count=2,
            )
        )
        await db_session.flush()

        db_session.add(
            Transaction(
                id="t1",
                date=date(2024, 1, 15),
                description="Coffee",
                category="Food",
                amount=Decimal("4.50"),
                type="expense",
                created_by_user_id="user1",
                import_id="sess1",
            )
        )
        db_session.add(
            Transaction(
                id="t2",
                date=date(2024, 1, 16),
                description="Unrelated",
                category="Food",
                amount=Decimal("3.00"),
                type="expense",
                created_by_user_id="user1",
            )
        )
        await db_session.flush()

        response = await client.delete("/api/import-sessions/sess1")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["removed"] == 1

        # Session should be gone
        result = await db_session.execute(
            select(ImportSession).where(ImportSession.id == "sess1")
        )
        assert result.scalar_one_or_none() is None

        # t2 should still exist
        result = await db_session.execute(
            select(Transaction).where(Transaction.id == "t2")
        )
        assert result.scalar_one_or_none() is not None
