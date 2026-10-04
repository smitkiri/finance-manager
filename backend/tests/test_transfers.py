from datetime import date
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import Transaction
from app.models.transfer_group import TransferGroup
from app.utils.transfer_groups import create_group


async def _seed_transfer_transactions(db: AsyncSession):
    txns = [
        Transaction(
            id="tf1",
            date=date(2024, 1, 15),
            description="Transfer out",
            category="Transfer",
            amount=Decimal("100.00"),
            type="expense",
            created_by_user_id="alice",
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
            created_by_user_id="alice",
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
            created_by_user_id="alice",
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

    groups = (await db_session.execute(select(TransferGroup))).scalars().all()
    assert len(groups) == 1
    assert groups[0].source == "auto"
    tf1 = await db_session.get(Transaction, "tf1")
    tf2 = await db_session.get(Transaction, "tf2")
    assert tf1 is not None and tf2 is not None
    assert tf1.transfer_group_id == tf2.transfer_group_id == groups[0].id
    assert tf1.effective_amount == tf2.effective_amount == Decimal("0.00")


@pytest.mark.asyncio
async def test_detect_transfers_no_transactions(client: AsyncClient):
    response = await client.post("/api/detect-transfers")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_rerun_transfer_detection(client: AsyncClient, db_session: AsyncSession):
    await _seed_transfer_transactions(db_session)
    response = await client.post("/api/rerun-transfer-detection")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["transfersDetected"] == 1


@pytest.mark.asyncio
async def test_detection_skips_rows_already_grouped(
    client: AsyncClient, db_session: AsyncSession
):
    await _seed_transfer_transactions(db_session)
    await create_group(db_session, "household-default", "tf2", ["tf1"])
    response = await client.post("/api/detect-transfers")
    assert response.json()["transfersDetected"] == 0
    groups = (await db_session.execute(select(TransferGroup))).scalars().all()
    assert len(groups) == 1


@pytest.mark.asyncio
async def test_rerun_keeps_manual_groups_and_rebuilds_auto(
    client: AsyncClient, db_session: AsyncSession
):
    await _seed_transfer_transactions(db_session)
    db_session.add_all(
        [
            Transaction(
                id="m_in",
                date=date(2024, 3, 1),
                description="Refund",
                category="Shopping",
                amount=Decimal("30.00"),
                type="income",
                created_by_user_id="alice",
                labels=[],
                metadata_={"sourceId": "src1"},
            ),
            Transaction(
                id="m_out",
                date=date(2024, 2, 20),
                description="Shoes",
                category="Shopping",
                amount=Decimal("80.00"),
                type="expense",
                created_by_user_id="alice",
                labels=[],
                metadata_={"sourceId": "src1"},
            ),
        ]
    )
    await db_session.flush()
    manual = await create_group(db_session, "household-default", "m_in", ["m_out"])
    await client.post("/api/detect-transfers")
    auto_before = (
        await db_session.execute(
            select(TransferGroup.id).where(TransferGroup.source == "auto")
        )
    ).scalar_one()

    response = await client.post("/api/rerun-transfer-detection")
    assert response.json()["transfersDetected"] == 1

    groups = {
        g.id: g for g in (await db_session.execute(select(TransferGroup))).scalars()
    }
    assert manual.id in groups
    m_out = await db_session.get(Transaction, "m_out")
    assert m_out is not None
    await db_session.refresh(m_out)
    assert m_out.effective_amount == Decimal("50.00")
    autos = [g for g in groups.values() if g.source == "auto"]
    assert len(autos) == 1
    assert autos[0].id != auto_before
