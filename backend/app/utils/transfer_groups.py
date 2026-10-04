"""Transfer/refund groups: one anchor offset by N opposite-type members.

This module is the single owner of group allocation. Every write path that
can change a grouped transaction (create/edit/unlink a group, edit or delete
a member, bulk replace, import undo, detection) ends by calling
`recompute_group`/`recompute_groups`, so `transactions.effective_amount` is
always current and read paths never recompute anything.

Allocation (amounts are positive magnitudes; `type` carries the sign):
- anchor total >= members total: the anchor keeps the difference, members 0.
- otherwise the anchor is 0 and the remainder is kept by members in
  (date, created_at, id) order until it runs out.
"""

import secrets
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import Transaction
from app.models.transfer_group import TransferGroup

CENT = Decimal("0.01")
ZERO = Decimal("0.00")


@dataclass(frozen=True)
class AllocRow:
    id: str
    amount: Decimal
    date: date
    created_at: datetime | None


def _order_key(row: AllocRow) -> tuple:
    return (row.date, row.created_at or datetime.min, row.id)


def allocate(anchor: AllocRow, members: list[AllocRow]) -> dict[str, Decimal]:
    """Return the counted (positive) amount for every row in the group."""
    anchor_total = abs(anchor.amount)
    members_total = sum((abs(m.amount) for m in members), Decimal("0"))
    result = {anchor.id: ZERO} | {m.id: ZERO for m in members}

    if anchor_total >= members_total:
        result[anchor.id] = (anchor_total - members_total).quantize(CENT)
        return result

    remaining = members_total - anchor_total
    for member in sorted(members, key=_order_key):
        keep = min(abs(member.amount), remaining)
        result[member.id] = keep.quantize(CENT)
        remaining -= keep
        if remaining <= 0:
            break
    return result


class GroupValidationError(ValueError):
    pass


def new_group_id() -> str:
    return f"tg_{secrets.token_hex(8)}"


def _alloc_row(txn: Transaction) -> AllocRow:
    # Freshly constructed rows may still hold the float they were built with.
    return AllocRow(
        id=txn.id,
        amount=Decimal(str(txn.amount)),
        date=txn.date,
        created_at=txn.created_at,
    )


def _detach(txn: Transaction) -> None:
    txn.transfer_group_id = None
    txn.transfer_role = None
    txn.effective_amount = None


async def _group_rows(db: AsyncSession, group_id: str) -> Sequence[Transaction]:
    result = await db.execute(
        select(Transaction).where(Transaction.transfer_group_id == group_id)
    )
    return result.scalars().all()


async def _load_for_group(
    db: AsyncSession,
    household_id: str,
    anchor_id: str,
    member_ids: list[str],
    group_id: str | None,
) -> tuple[Transaction, list[Transaction]]:
    if not member_ids:
        raise GroupValidationError("A group needs at least one member")
    if anchor_id in member_ids:
        raise GroupValidationError("The anchor can't also be a member")
    if len(set(member_ids)) != len(member_ids):
        raise GroupValidationError("A member is listed more than once")

    ids = [anchor_id, *member_ids]
    result = await db.execute(
        select(Transaction).where(
            Transaction.id.in_(ids), Transaction.household_id == household_id
        )
    )
    by_id = {t.id: t for t in result.scalars().all()}
    missing = [i for i in ids if i not in by_id]
    if missing:
        raise GroupValidationError(f"Transactions not found: {', '.join(missing)}")

    anchor = by_id[anchor_id]
    members = [by_id[i] for i in member_ids]
    if any(m.type == anchor.type for m in members):
        raise GroupValidationError("Members must be the opposite type of the anchor")
    taken = [
        t.id
        for t in (anchor, *members)
        if t.transfer_group_id is not None and t.transfer_group_id != group_id
    ]
    if taken:
        raise GroupValidationError(
            f"Already in another transfer group: {', '.join(taken)}"
        )
    return anchor, members


async def create_group(
    db: AsyncSession,
    household_id: str,
    anchor_id: str,
    member_ids: list[str],
    source: str = "manual",
    include_in_calculations: bool = False,
) -> TransferGroup:
    anchor, members = await _load_for_group(
        db, household_id, anchor_id, member_ids, group_id=None
    )
    group = TransferGroup(
        id=new_group_id(),
        household_id=household_id,
        kind="self",
        source=source,
        include_in_calculations=include_in_calculations,
    )
    db.add(group)
    await db.flush()

    anchor.transfer_group_id = group.id
    anchor.transfer_role = "anchor"
    for member in members:
        member.transfer_group_id = group.id
        member.transfer_role = "member"
    await db.flush()

    await recompute_group(db, group.id)
    return group


async def set_members(
    db: AsyncSession, group: TransferGroup, member_ids: list[str]
) -> None:
    rows = await _group_rows(db, group.id)
    anchor = next((r for r in rows if r.transfer_role == "anchor"), None)
    if anchor is None:
        raise GroupValidationError("Group has no anchor")
    _, members = await _load_for_group(
        db, group.household_id, anchor.id, member_ids, group_id=group.id
    )

    keep = set(member_ids)
    for row in rows:
        if row.transfer_role == "member" and row.id not in keep:
            _detach(row)
    for member in members:
        member.transfer_group_id = group.id
        member.transfer_role = "member"
    await db.flush()

    await recompute_group(db, group.id)


async def recompute_group(db: AsyncSession, group_id: str) -> None:
    group = await db.get(TransferGroup, group_id)
    if group is None:
        return
    rows = await _group_rows(db, group_id)
    anchor = next((r for r in rows if r.transfer_role == "anchor"), None)
    members = [r for r in rows if r.transfer_role == "member"]

    if anchor is not None:
        mismatched = [m for m in members if m.type == anchor.type]
        for member in mismatched:
            _detach(member)
        members = [m for m in members if m.type != anchor.type]

    if anchor is None or not members:
        await _dissolve(db, group, rows)
        return

    group.kind = (
        "user"
        if any(m.created_by_user_id != anchor.created_by_user_id for m in members)
        else "self"
    )
    if group.include_in_calculations:
        for row in (anchor, *members):
            row.effective_amount = None
    else:
        allocation = allocate(_alloc_row(anchor), [_alloc_row(m) for m in members])
        for row in (anchor, *members):
            row.effective_amount = allocation[row.id]
    await db.flush()


async def recompute_groups(db: AsyncSession, group_ids: Iterable[str | None]) -> None:
    for group_id in sorted({g for g in group_ids if g}):
        await recompute_group(db, group_id)


async def _dissolve(
    db: AsyncSession, group: TransferGroup, rows: Sequence[Transaction]
) -> None:
    for row in rows:
        _detach(row)
    # Rows must be released before the group row goes (FK has no ondelete).
    await db.flush()
    await db.delete(group)
    await db.flush()


async def dissolve_group(db: AsyncSession, group_id: str) -> None:
    group = await db.get(TransferGroup, group_id)
    if group is None:
        return
    await _dissolve(db, group, await _group_rows(db, group_id))


async def dissolve_groups_where(db: AsyncSession, *clauses) -> int:
    result = await db.execute(select(TransferGroup.id).where(*clauses))
    group_ids = result.scalars().all()
    for group_id in group_ids:
        await dissolve_group(db, group_id)
    return len(group_ids)


async def delete_household_groups(db: AsyncSession, household_id: str) -> None:
    await dissolve_groups_where(db, TransferGroup.household_id == household_id)


async def adopt_legacy_transfer_info(db: AsyncSession, household_id: str) -> int:
    """Convert legacy `transfer_info` pairs on ungrouped rows into groups.

    Used for legacy backups and the demo fixture. Mirrors the conversion in
    the `add_transfer_groups` migration. Returns the number of groups created.
    """
    result = await db.execute(
        select(Transaction).where(
            Transaction.household_id == household_id,
            Transaction.transfer_group_id.is_(None),
            Transaction.transfer_info["isTransfer"].astext == "true",
        )
    )
    pairs: dict[str, list[Transaction]] = {}
    for txn in result.scalars().all():
        transfer_id = (txn.transfer_info or {}).get("transferId")
        if transfer_id:
            pairs.setdefault(transfer_id, []).append(txn)

    created = 0
    for rows in pairs.values():
        if len(rows) != 2 or rows[0].type == rows[1].type:
            continue
        info = rows[0].transfer_info or {}
        override = bool(info.get("userOverride"))
        anchor, member = sorted(rows, key=lambda t: (t.date, t.id))
        await create_group(
            db,
            household_id,
            anchor.id,
            [member.id],
            source="manual" if override else "auto",
            include_in_calculations=override
            and not info.get("excludedFromCalculations", True),
        )
        created += 1
    return created


async def serialize_transactions(
    db: AsyncSession, txns: Sequence[Transaction]
) -> list[dict]:
    """`TransactionOut` dicts with group refs, loading all groups in one query."""
    from app.schemas.transaction import TransactionOut

    group_ids = {t.transfer_group_id for t in txns if t.transfer_group_id}
    groups: dict[str, TransferGroup] = {}
    if group_ids:
        result = await db.execute(
            select(TransferGroup).where(TransferGroup.id.in_(group_ids))
        )
        groups = {g.id: g for g in result.scalars().all()}
    return [
        TransactionOut.from_orm_model(
            t, groups.get(t.transfer_group_id) if t.transfer_group_id else None
        ).model_dump()
        for t in txns
    ]


async def group_out(db: AsyncSession, group: TransferGroup) -> dict:
    """Group with its rows: anchor first, then members in allocation order."""
    rows = await _group_rows(db, group.id)
    ordered = sorted(
        rows,
        key=lambda t: (t.transfer_role != "anchor", _order_key(_alloc_row(t))),
    )
    return {
        "id": group.id,
        "kind": group.kind,
        "source": group.source,
        "includeInCalculations": group.include_in_calculations,
        "transactions": await serialize_transactions(db, ordered),
    }
