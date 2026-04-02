from datetime import date
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import Transaction


async def _seed_transfer_transactions(db: AsyncSession):
    txns = [
        Transaction(
            id="tf1",
            date=date(2024, 1, 15),
            description="Transfer out",
            category="Transfer",
            amount=Decimal("100.00"),
            type="expense",
            user_id="alice",
            labels=[],
            metadata_={"sourceId": "src1"},
        ),
        Transaction(
            id="tf2",
            date=date(2024, 1, 15),
            description="Transfer in",
            category="Transfer",
            amount=Decimal("100.00"),
            type="income",
            user_id="alice",
            labels=[],
            metadata_={"sourceId": "src2"},
        ),
        Transaction(
            id="tf3",
            date=date(2024, 1, 20),
            description="Groceries",
            category="Food",
            amount=Decimal("50.00"),
            type="expense",
            user_id="alice",
            labels=[],
            metadata_={"sourceId": "src1"},
        ),
    ]
    db.add_all(txns)
    await db.flush()


@pytest.mark.asyncio
async def test_detect_transfers(client: AsyncClient, db_session: AsyncSession):
    await _seed_transfer_transactions(db_session)
    response = await client.post("/api/detect-transfers")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["transfersDetected"] == 1
    assert data["totalTransactions"] == 3


@pytest.mark.asyncio
async def test_detect_transfers_no_transactions(client: AsyncClient):
    response = await client.post("/api/detect-transfers")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_transfer_override(client: AsyncClient, db_session: AsyncSession):
    await _seed_transfer_transactions(db_session)
    # First detect transfers
    await client.post("/api/detect-transfers")

    # Override: include in calculations
    response = await client.post(
        "/api/transfer-override",
        json={"transactionId": "tf1", "includeInCalculations": True},
    )
    assert response.status_code == 200
    assert response.json()["success"] is True


@pytest.mark.asyncio
async def test_transfer_override_not_found(client: AsyncClient):
    response = await client.post(
        "/api/transfer-override",
        json={"transactionId": "nonexistent", "includeInCalculations": True},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_transfer_override_not_a_transfer(
    client: AsyncClient, db_session: AsyncSession
):
    await _seed_transfer_transactions(db_session)
    # tf3 is not a transfer
    response = await client.post(
        "/api/transfer-override",
        json={"transactionId": "tf3", "includeInCalculations": True},
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_transfer_override_updates_linked_transactions(
    client: AsyncClient, db_session: AsyncSession
):
    await _seed_transfer_transactions(db_session)
    await client.post("/api/detect-transfers")

    # Override tf1 — tf2 (same transferId) should also be updated
    await client.post(
        "/api/transfer-override",
        json={"transactionId": "tf1", "includeInCalculations": True},
    )

    # Fetch tf2 and check its transfer_info was updated
    response = await client.get("/api/expenses")
    data = response.json()
    tf2 = next(t for t in data if t["id"] == "tf2")
    assert tf2["transferInfo"]["userOverride"] is True
    assert tf2["transferInfo"]["excludedFromCalculations"] is False


@pytest.mark.asyncio
async def test_rerun_transfer_detection(client: AsyncClient, db_session: AsyncSession):
    await _seed_transfer_transactions(db_session)
    response = await client.post("/api/rerun-transfer-detection")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["transfersDetected"] == 1
