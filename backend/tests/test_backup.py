import io
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

    async def test_restore_does_not_create_new_users(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        """Restore must not insert User rows with attacker-chosen
        id/email/password_hash. Otherwise an authenticated user can seed
        login-capable accounts in their household."""
        backup = {
            "users": [
                {
                    "id": "u-attacker-seeded",
                    "email": "attacker-seeded@evil.example",
                    "password_hash": (
                        "$argon2id$v=19$m=65536,t=3,p=4$attackerKnowsThis"
                    ),
                    "name": "Backdoor",
                }
            ],
            "categories": [],
            "sources": [],
            "reports": [],
            "date_ranges": [],
            "metadata": [],
            "accounts": [],
            "account_balances": [],
            "transactions": [],
        }
        response = await client.post(
            "/api/restore",
            files={
                "backupFile": (
                    "backup.json",
                    io.BytesIO(json.dumps(backup).encode("utf-8")),
                    "application/json",
                )
            },
        )
        assert response.status_code == 200

        result = await db_session.execute(
            select(User).where(User.id == "u-attacker-seeded")
        )
        assert result.scalar_one_or_none() is None

    async def test_restore_strips_user_attribution(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        """Restore must not let the uploader set created_by_user_id to an
        arbitrary string — it should be set to the caller (or None)."""
        backup = {
            "users": [],
            "categories": [],
            "sources": [],
            "reports": [],
            "date_ranges": [],
            "metadata": [],
            "accounts": [],
            "account_balances": [],
            "transactions": [
                {
                    "id": "t-attrib",
                    "date": "2026-05-01",
                    "description": "x",
                    "category": "Food",
                    "amount": 10,
                    "type": "expense",
                    "created_by_user_id": "u-someone-else",
                }
            ],
        }
        response = await client.post(
            "/api/restore",
            files={
                "backupFile": (
                    "backup.json",
                    io.BytesIO(json.dumps(backup).encode("utf-8")),
                    "application/json",
                )
            },
        )
        assert response.status_code == 200

        result = await db_session.execute(
            select(Transaction).where(Transaction.id == "t-attrib")
        )
        txn = result.scalar_one()
        # created_by_user_id should be either None or the authenticated user
        # — never an arbitrary id supplied by the uploader.
        assert txn.created_by_user_id != "u-someone-else"
