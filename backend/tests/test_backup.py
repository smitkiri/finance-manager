import json
from datetime import date
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.models.transaction import Transaction
from app.models.user import User


class TestBackup:
    async def test_backup_returns_all_tables(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        db_session.add(User(id="user1", name="Alice"))
        db_session.add(Category(id="Food", name="Food"))
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

        response = await client.get("/api/backup")
        assert response.status_code == 200
        data = response.json()

        assert "users" in data
        assert "categories" in data
        assert "transactions" in data
        assert "sources" in data
        assert "reports" in data
        assert "date_ranges" in data
        assert "metadata" in data
        assert "accounts" in data
        assert "account_balances" in data

        # Conftest seeds a default user; this test adds one more.
        assert len(data["users"]) == 2
        assert len(data["transactions"]) == 1

    async def test_backup_with_date_filter(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        db_session.add(
            Transaction(
                id="t1",
                date=date(2024, 1, 15),
                description="Jan",
                category="Food",
                amount=Decimal("4.50"),
                type="expense",
                created_by_user_id="user1",
            )
        )
        db_session.add(
            Transaction(
                id="t2",
                date=date(2024, 3, 15),
                description="Mar",
                category="Food",
                amount=Decimal("3.00"),
                type="expense",
                created_by_user_id="user1",
            )
        )
        await db_session.flush()

        response = await client.get("/api/backup?dateFrom=2024-02-01&dateTo=2024-04-01")
        data = response.json()
        assert len(data["transactions"]) == 1
        assert data["transactions"][0]["id"] == "t2"

    async def test_backup_empty_db(self, client: AsyncClient, db_session: AsyncSession):
        response = await client.get("/api/backup")
        assert response.status_code == 200
        data = response.json()
        assert data["transactions"] == []


class TestRestore:
    async def test_restore_from_backup(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        backup_data = {
            "users": [{"id": "user1", "name": "Alice"}],
            "categories": [{"name": "Food"}],
            "sources": [],
            "transactions": [
                {
                    "id": "t1",
                    "date": "2024-01-15",
                    "description": "Coffee",
                    "category": "Food",
                    "amount": 4.50,
                    "type": "expense",
                    "user_id": "user1",
                    "labels": [],
                    "metadata": {},
                    "transfer_info": None,
                    "excluded_from_calculations": False,
                }
            ],
            "reports": [],
            "date_ranges": [],
            "metadata": [],
            "accounts": [],
            "account_balances": [],
        }

        files = {
            "backupFile": (
                "backup.json",
                json.dumps(backup_data).encode(),
                "application/json",
            )
        }
        response = await client.post("/api/restore", files=files)
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True

        result = await db_session.execute(select(Transaction))
        assert len(result.scalars().all()) == 1

    async def test_restore_no_file(self, client: AsyncClient, db_session: AsyncSession):
        response = await client.post("/api/restore")
        assert response.status_code == 400

    async def test_restore_on_conflict_do_nothing(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        """Duplicate IDs should not cause errors."""
        db_session.add(User(id="user1", name="Alice"))
        await db_session.flush()

        backup_data = {
            "users": [{"id": "user1", "name": "Bob"}],
            "categories": [],
            "sources": [],
            "transactions": [],
            "reports": [],
            "date_ranges": [],
            "metadata": [],
            "accounts": [],
            "account_balances": [],
        }

        files = {
            "backupFile": (
                "backup.json",
                json.dumps(backup_data).encode(),
                "application/json",
            )
        }
        response = await client.post("/api/restore", files=files)
        assert response.status_code == 200

        # Original name should be preserved (ON CONFLICT DO NOTHING)
        result = await db_session.execute(select(User).where(User.id == "user1"))
        user = result.scalar_one()
        assert user.name == "Alice"
