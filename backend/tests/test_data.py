from datetime import date
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.import_session import ImportSession
from app.models.source import Source
from app.models.transaction import Transaction


class TestDeleteAll:
    async def test_delete_all_transactions_and_sources(
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
        db_session.add(Source(id="s1", name="Bank A"))
        await db_session.flush()

        response = await client.delete("/api/delete-all")
        assert response.status_code == 200
        assert response.json()["success"] is True

        result = await db_session.execute(select(Transaction))
        assert result.scalars().all() == []
        result = await db_session.execute(select(Source))
        assert result.scalars().all() == []


class TestDeleteSelected:
    async def test_delete_transactions_only(
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
        db_session.add(Source(id="s1", name="Bank A"))
        await db_session.flush()

        response = await client.post(
            "/api/delete-selected", json={"deleteTransactions": True}
        )
        assert response.status_code == 200
        assert response.json()["success"] is True

        result = await db_session.execute(select(Transaction))
        assert result.scalars().all() == []
        # Sources should still exist
        result = await db_session.execute(select(Source))
        assert len(result.scalars().all()) == 1

    async def test_delete_sources_by_ids(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        db_session.add(Source(id="s1", name="Bank A"))
        db_session.add(Source(id="s2", name="Bank B"))
        await db_session.flush()

        response = await client.post(
            "/api/delete-selected",
            json={"deleteSources": True, "sourceIds": ["s1"]},
        )
        assert response.status_code == 200

        result = await db_session.execute(select(Source))
        sources = result.scalars().all()
        assert len(sources) == 1
        assert sources[0].id == "s2"


class TestUndoImport:
    async def test_undo_import(self, client: AsyncClient, db_session: AsyncSession):
        db_session.add(
            ImportSession(id="sess1", source_name="test.csv", transaction_count=1)
        )
        await db_session.flush()
        db_session.add(
            Transaction(
                id="t1",
                date=date(2024, 1, 15),
                description="Imported",
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
                description="Manual",
                category="Food",
                amount=Decimal("3.00"),
                type="expense",
                created_by_user_id="user1",
            )
        )
        await db_session.flush()

        response = await client.post("/api/undo-import", json={"sessionId": "sess1"})
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["removed"] == 1

        # t1 and session should be gone, t2 remains
        result = await db_session.execute(select(Transaction))
        remaining = result.scalars().all()
        assert len(remaining) == 1
        assert remaining[0].id == "t2"

    async def test_undo_import_missing_session_id(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        response = await client.post("/api/undo-import", json={})
        assert response.status_code == 422  # Pydantic validation error
