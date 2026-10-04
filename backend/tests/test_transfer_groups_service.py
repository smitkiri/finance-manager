"""DB tests for the transfer group service."""

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import Transaction
from app.models.transfer_group import TransferGroup
from app.utils.transfer_groups import (
    GroupValidationError,
    adopt_legacy_transfer_info,
    create_group,
    recompute_group,
    set_members,
)

HH = "household-default"
D = Decimal


def _txn(tid, amount, typ, d=date(2024, 1, 1), user="alice", **kw):
    return Transaction(
        id=tid,
        date=d,
        description=tid,
        category="Transfers",
        amount=D(amount),
        type=typ,
        household_id=kw.pop("household_id", HH),
        created_by_user_id=user,
        labels=[],
        metadata_={},
        **kw,
    )


async def _seed_paycheck_and_venmos(db: AsyncSession, anchor_amount="5000.00"):
    db.add(_txn("pay", anchor_amount, "income"))
    for i in range(5):
        db.add(_txn(f"v{i}", "900.00", "expense", date(2024, 1, 2 + i)))
    await db.flush()


async def _get(db: AsyncSession, tid: str) -> Transaction:
    txn = await db.get(Transaction, tid)
    assert txn is not None
    await db.refresh(txn)
    return txn


@pytest.mark.asyncio
async def test_create_group_assigns_roles_and_effective_amounts(
    db_session: AsyncSession,
):
    await _seed_paycheck_and_venmos(db_session)
    group = await create_group(db_session, HH, "pay", [f"v{i}" for i in range(5)])

    assert group.source == "manual"
    assert group.kind == "self"
    pay = await _get(db_session, "pay")
    assert (pay.transfer_group_id, pay.transfer_role) == (group.id, "anchor")
    assert pay.effective_amount == D("500.00")
    for i in range(5):
        v = await _get(db_session, f"v{i}")
        assert v.transfer_role == "member"
        assert v.effective_amount == D("0.00")


@pytest.mark.asyncio
async def test_create_group_remainder_on_oldest_member(db_session: AsyncSession):
    await _seed_paycheck_and_venmos(db_session, anchor_amount="4000.00")
    await create_group(db_session, HH, "pay", [f"v{i}" for i in range(5)])
    assert (await _get(db_session, "pay")).effective_amount == D("0.00")
    assert (await _get(db_session, "v0")).effective_amount == D("500.00")
    assert (await _get(db_session, "v4")).effective_amount == D("0.00")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "anchor_id,member_ids,message",
    [
        ("pay", [], "at least one"),
        ("pay", ["pay"], "anchor"),
        ("pay", ["v0", "v0"], "more than once"),
        ("pay", ["inc2"], "opposite type"),
        ("pay", ["missing"], "not found"),
        ("pay", ["other_hh"], "not found"),
    ],
)
async def test_create_group_validation(
    db_session: AsyncSession, anchor_id, member_ids, message
):
    await db_session.execute(
        text(
            "INSERT INTO households (id, name) VALUES ('hh-other', 'Other') "
            "ON CONFLICT DO NOTHING"
        )
    )
    await _seed_paycheck_and_venmos(db_session)
    db_session.add(_txn("inc2", "10.00", "income"))
    db_session.add(_txn("other_hh", "10.00", "expense", household_id="hh-other"))
    await db_session.flush()

    with pytest.raises(GroupValidationError, match=message):
        await create_group(db_session, HH, anchor_id, member_ids)


@pytest.mark.asyncio
async def test_create_group_rejects_rows_in_another_group(db_session: AsyncSession):
    await _seed_paycheck_and_venmos(db_session)
    db_session.add(_txn("pay2", "900.00", "income"))
    await db_session.flush()
    await create_group(db_session, HH, "pay", ["v0"])

    with pytest.raises(GroupValidationError, match="(?i)already"):
        await create_group(db_session, HH, "pay2", ["v0"])
    with pytest.raises(GroupValidationError, match="(?i)already"):
        await create_group(db_session, HH, "pay", ["v1"])


@pytest.mark.asyncio
async def test_set_members_reallocates_and_releases_dropped_rows(
    db_session: AsyncSession,
):
    await _seed_paycheck_and_venmos(db_session)
    group = await create_group(db_session, HH, "pay", [f"v{i}" for i in range(5)])

    await set_members(db_session, group, ["v0", "v1"])

    assert (await _get(db_session, "pay")).effective_amount == D("3200.00")
    dropped = await _get(db_session, "v4")
    assert dropped.transfer_group_id is None
    assert dropped.transfer_role is None
    assert dropped.effective_amount is None


@pytest.mark.asyncio
async def test_recompute_dissolves_group_without_anchor(db_session: AsyncSession):
    await _seed_paycheck_and_venmos(db_session)
    group = await create_group(db_session, HH, "pay", ["v0", "v1"])
    pay = await _get(db_session, "pay")
    await db_session.delete(pay)
    await db_session.flush()

    await recompute_group(db_session, group.id)

    assert await db_session.get(TransferGroup, group.id) is None
    v0 = await _get(db_session, "v0")
    assert (v0.transfer_group_id, v0.transfer_role, v0.effective_amount) == (
        None,
        None,
        None,
    )


@pytest.mark.asyncio
async def test_recompute_detaches_member_with_anchor_type(db_session: AsyncSession):
    await _seed_paycheck_and_venmos(db_session)
    group = await create_group(db_session, HH, "pay", ["v0", "v1"])
    v1 = await _get(db_session, "v1")
    v1.type = "income"
    await db_session.flush()

    await recompute_group(db_session, group.id)

    v1 = await _get(db_session, "v1")
    assert v1.transfer_group_id is None
    assert (await _get(db_session, "pay")).effective_amount == D("4100.00")


@pytest.mark.asyncio
async def test_include_in_calculations_counts_everything_in_full(
    db_session: AsyncSession,
):
    await _seed_paycheck_and_venmos(db_session)
    group = await create_group(db_session, HH, "pay", ["v0"])
    group.include_in_calculations = True
    await recompute_group(db_session, group.id)

    assert (await _get(db_session, "pay")).effective_amount is None
    assert (await _get(db_session, "v0")).effective_amount is None


@pytest.mark.asyncio
async def test_kind_is_user_when_members_belong_to_someone_else(
    db_session: AsyncSession,
):
    db_session.add(_txn("pay", "100.00", "income", user="alice"))
    db_session.add(_txn("bob_out", "100.00", "expense", user="bob"))
    await db_session.flush()
    group = await create_group(db_session, HH, "pay", ["bob_out"])
    assert group.kind == "user"


@pytest.mark.asyncio
async def test_adopt_legacy_transfer_info(db_session: AsyncSession):
    info = {
        "isTransfer": True,
        "transferId": "legacy1",
        "transferType": "self",
        "excludedFromCalculations": True,
        "userOverride": False,
    }
    db_session.add(
        _txn("l_out", "75.00", "expense", date(2024, 2, 2), transfer_info=info)
    )
    db_session.add(
        _txn("l_in", "75.00", "income", date(2024, 2, 1), transfer_info=info)
    )
    await db_session.flush()

    assert await adopt_legacy_transfer_info(db_session, HH) == 1
    l_in = await _get(db_session, "l_in")
    assert l_in.transfer_role == "anchor"
    assert l_in.effective_amount == D("0.00")
    group = await db_session.get(TransferGroup, l_in.transfer_group_id)
    assert group is not None and group.source == "auto"

    # Idempotent: already-grouped rows are skipped.
    assert await adopt_legacy_transfer_info(db_session, HH) == 0
    count = len((await db_session.execute(select(TransferGroup))).scalars().all())
    assert count == 1
