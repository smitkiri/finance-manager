"""Household-scoped label persistence; callers own commit/rollback boundaries."""

from collections.abc import Callable, Iterable, Mapping, Sequence
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import and_, delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dashboard import Dashboard, DashboardPanel
from app.models.household import Household
from app.models.label import Label, TransactionLabel
from app.models.report import Report
from app.models.transaction import Transaction

ASCII_WHITESPACE = " \t\n\r\f\v"
MAX_LABEL_NAME_LENGTH = 255
BATCH_SIZE = 1000


def normalize_label_names(names: Iterable[str]) -> list[str]:
    if isinstance(names, (str, bytes)):
        raise ValueError("Labels must be an array of strings")
    result = set()
    for name in names:
        if not isinstance(name, str):
            raise ValueError("Labels must contain only strings")
        normalized = name.strip(ASCII_WHITESPACE)
        if len(normalized) > MAX_LABEL_NAME_LENGTH:
            raise ValueError(
                f"Label names must be at most {MAX_LABEL_NAME_LENGTH} characters "
                "after trimming"
            )
        if normalized:
            result.add(normalized)
    return sorted(result)


async def lock_household_labels(db: AsyncSession, household_id: str) -> None:
    # Acquire before autoflush and before any label/transaction mutation locks.
    with db.no_autoflush:
        household = await db.scalar(
            select(Household.id).where(Household.id == household_id).with_for_update()
        )
    if household is None:
        raise HTTPException(status_code=404, detail="Household not found")


async def ensure_labels(
    db: AsyncSession, household_id: str, names: Iterable[str], created_by: str = "user"
) -> dict[str, Label]:
    normalized = normalize_label_names(names)
    if created_by not in ("user", "ai"):
        raise ValueError("Label origin must be user or ai")
    await lock_household_labels(db, household_id)
    for start in range(0, len(normalized), BATCH_SIZE):
        batch = normalized[start : start + BATCH_SIZE]
        await db.execute(
            insert(Label)
            .values(
                [
                    {
                        "id": str(uuid4()),
                        "household_id": household_id,
                        "name": name,
                        "created_by": created_by,
                    }
                    for name in batch
                ]
            )
            .on_conflict_do_nothing(constraint="labels_household_name_uniq")
        )
    result = {}
    for start in range(0, len(normalized), BATCH_SIZE):
        rows = await db.scalars(
            select(Label).where(
                Label.household_id == household_id,
                Label.name.in_(normalized[start : start + BATCH_SIZE]),
            )
        )
        result.update((label.name, label) for label in rows)
    return result


async def replace_transaction_labels(
    db: AsyncSession,
    household_id: str,
    transaction_ids_to_names: Mapping[str, Iterable[str]],
) -> None:
    if not transaction_ids_to_names:
        return
    normalized = {
        transaction_id: normalize_label_names(names)
        for transaction_id, names in transaction_ids_to_names.items()
    }
    await lock_household_labels(db, household_id)
    await db.flush()
    ids = list(normalized)
    owned = set()
    for start in range(0, len(ids), BATCH_SIZE):
        owned.update(
            await db.scalars(
                select(Transaction.id).where(
                    Transaction.id.in_(ids[start : start + BATCH_SIZE]),
                    Transaction.household_id == household_id,
                )
            )
        )
    if owned != set(ids):
        raise HTTPException(status_code=404, detail="Transaction not found")
    labels = await ensure_labels(
        db, household_id, [name for names in normalized.values() for name in names]
    )
    for start in range(0, len(ids), BATCH_SIZE):
        await db.execute(
            delete(TransactionLabel).where(
                TransactionLabel.transaction_id.in_(ids[start : start + BATCH_SIZE])
            )
        )
    batch = []
    for transaction_id, names in normalized.items():
        for name in names:
            batch.append(
                {"transaction_id": transaction_id, "label_id": labels[name].id}
            )
            if len(batch) == BATCH_SIZE:
                await db.execute(insert(TransactionLabel), batch)
                batch = []
    if batch:
        await db.execute(insert(TransactionLabel), batch)
    await db.flush()


async def load_transaction_label_names(
    db: AsyncSession, transactions: Sequence[Transaction]
) -> dict[str, list[str]]:
    names = {transaction.id: [] for transaction in transactions}
    ids = list(names)
    for start in range(0, len(ids), BATCH_SIZE):
        rows = await db.execute(
            select(TransactionLabel.transaction_id, Label.name)
            .join(Label, Label.id == TransactionLabel.label_id)
            .join(Transaction, Transaction.id == TransactionLabel.transaction_id)
            .where(
                Transaction.id.in_(ids[start : start + BATCH_SIZE]),
                Label.household_id == Transaction.household_id,
            )
        )
        for transaction_id, name in rows:
            names[transaction_id].append(name)
    return {transaction_id: sorted(values) for transaction_id, values in names.items()}


async def list_label_definitions(db: AsyncSession, household_id: str) -> list[dict]:
    rows = await db.execute(
        select(Label, func.count(Transaction.id))
        .outerjoin(TransactionLabel, TransactionLabel.label_id == Label.id)
        .outerjoin(
            Transaction,
            and_(
                Transaction.id == TransactionLabel.transaction_id,
                Transaction.household_id == household_id,
            ),
        )
        .where(Label.household_id == household_id)
        .group_by(Label.id)
    )
    return sorted(
        [
            {
                "id": label.id,
                "name": label.name,
                "createdAt": label.created_at,
                "createdBy": label.created_by,
                "usageCount": count,
            }
            for label, count in rows
        ],
        key=lambda item: item["name"],
    )


def validate_label_definitions(records: Any) -> list[dict]:
    if not isinstance(records, list):
        raise ValueError("Label vocabulary must be an array")
    result = []
    seen = set()
    for record in records:
        if not isinstance(record, dict) or not isinstance(record.get("name"), str):
            raise ValueError("Each label definition needs a string name")
        names = normalize_label_names([record["name"]])
        if not names:
            raise ValueError("Label definition name cannot be blank")
        origin = record.get("created_by", "user")
        if origin not in ("user", "ai"):
            raise ValueError("Label origin must be user or ai")
        created = record.get("created_at")
        if created is not None:
            if not isinstance(created, (str, datetime)):
                raise ValueError("Invalid label creation timestamp")
            created = (
                datetime.fromisoformat(created) if isinstance(created, str) else created
            )
            if created.tzinfo is not None:
                created = created.astimezone(UTC).replace(tzinfo=None)
        definition = {"name": names[0], "created_by": origin}
        if created is not None:
            definition["created_at"] = created
        # Preserve the first uploaded definition's metadata on duplicate names,
        # independent of whether its timestamp uses an explicit or DB default.
        if names[0] not in seen:
            result.append(definition)
            seen.add(names[0])
    return result


async def restore_label_definitions(
    db: AsyncSession, household_id: str, records: Any
) -> None:
    definitions = validate_label_definitions(records)
    await lock_household_labels(db, household_id)
    # Use a separate statement shape when a timestamp is present so omitted
    # timestamps retain the DB default, rather than inserting SQL NULL.
    for with_timestamp in (False, True):
        rows = [
            {**definition, "id": str(uuid4()), "household_id": household_id}
            for definition in definitions
            if ("created_at" in definition) == with_timestamp
        ]
        for start in range(0, len(rows), BATCH_SIZE):
            await db.execute(
                insert(Label)
                .values(rows[start : start + BATCH_SIZE])
                .on_conflict_do_nothing(constraint="labels_household_name_uniq")
            )


def _rewrite_names(names: Any, source: str, target: str) -> Any:
    if names is None:
        return None
    if not isinstance(names, list) or any(not isinstance(name, str) for name in names):
        raise ValueError("Saved label filters must be arrays of strings")
    return sorted({target if name == source else name for name in names})


def _transform_report_label_references(
    filters: Any, transform: Callable[[Any], Any]
) -> Any:
    if filters is None:
        return None
    if not isinstance(filters, dict):
        raise ValueError("Report filters must be objects")
    if "labels" not in filters:
        return filters
    return {**filters, "labels": transform(filters["labels"])}


def _transform_panel_label_references(
    groups: Any, transform: Callable[[Any], Any]
) -> Any:
    if groups is None:
        return None
    if not isinstance(groups, list):
        raise ValueError("Panel filters must be arrays of groups")
    result = []
    for group in groups:
        if not isinstance(group, dict):
            raise ValueError("Panel filter groups must be objects")
        conditions = group.get("conditions")
        if conditions is None:
            result.append(group)
            continue
        if not isinstance(conditions, list):
            raise ValueError("Panel conditions must be arrays")
        rewritten = []
        for condition in conditions:
            if not isinstance(condition, dict):
                raise ValueError("Panel conditions must be objects")
            if condition.get("field") == "labels" and "value" in condition:
                condition = {
                    **condition,
                    "value": transform(condition["value"]),
                }
            rewritten.append(condition)
        result.append({**group, "conditions": rewritten})
    return result


def rewrite_report_label_references(filters: Any, source: str, target: str) -> Any:
    return _transform_report_label_references(
        filters, lambda names: _rewrite_names(names, source, target)
    )


def rewrite_panel_label_references(groups: Any, source: str, target: str) -> Any:
    return _transform_panel_label_references(
        groups, lambda names: _rewrite_names(names, source, target)
    )


def _normalize_reference_names(names: Any) -> Any:
    if names is None:
        return None
    if not isinstance(names, list):
        raise ValueError("Saved label filters must be arrays of strings")
    return normalize_label_names(names)


def normalize_report_label_references(filters: Any) -> Any:
    """Normalize only the recognized report labels array; validate its shape."""
    return _transform_report_label_references(filters, _normalize_reference_names)


def normalize_panel_label_references(groups: Any) -> Any:
    """Normalize label-condition values while preserving all other JSON fields."""
    return _transform_panel_label_references(groups, _normalize_reference_names)


async def _rewrite_saved_references(
    db: AsyncSession, household_id: str, source: str, target: str
) -> None:
    reports = await db.scalars(
        select(Report).where(Report.household_id == household_id)
    )
    panels = await db.scalars(
        select(DashboardPanel)
        .join(Dashboard)
        .where(Dashboard.household_id == household_id)
    )
    now = datetime.now(UTC).replace(tzinfo=None)
    try:
        for report in reports:
            rewritten = rewrite_report_label_references(report.filters, source, target)
            if rewritten != report.filters:
                report.filters = rewritten
                report.last_modified = now
        for panel in panels:
            rewritten = rewrite_panel_label_references(
                panel.filter_groups, source, target
            )
            if rewritten != panel.filter_groups:
                panel.filter_groups = rewritten
                panel.updated_at = now
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


async def _catalog_item(db: AsyncSession, household_id: str, label_id: str) -> dict:
    return next(
        item
        for item in await list_label_definitions(db, household_id)
        if item["id"] == label_id
    )


async def rename_label(
    db: AsyncSession, household_id: str, label_id: str, name: str
) -> dict:
    try:
        normalized = normalize_label_names([name])
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    if not normalized:
        raise HTTPException(status_code=422, detail="Label name cannot be blank")
    await lock_household_labels(db, household_id)
    label = await db.scalar(
        select(Label)
        .where(Label.id == label_id, Label.household_id == household_id)
        .with_for_update()
    )
    if label is None:
        raise HTTPException(status_code=404, detail="Label not found")
    new_name = normalized[0]
    if new_name == label.name:
        return await _catalog_item(db, household_id, label_id)
    collision = await db.scalar(
        select(Label.id).where(
            Label.household_id == household_id, Label.name == new_name
        )
    )
    if collision is not None:
        raise HTTPException(
            status_code=409, detail="Label name already exists; merge explicitly"
        )
    await _rewrite_saved_references(db, household_id, label.name, new_name)
    label.name = new_name
    await db.flush()
    return await _catalog_item(db, household_id, label_id)


async def merge_labels(
    db: AsyncSession, household_id: str, source_id: str, target_id: str
) -> dict:
    if source_id == target_id:
        raise HTTPException(
            status_code=422, detail="Source and target labels must differ"
        )
    await lock_household_labels(db, household_id)
    rows = await db.scalars(
        select(Label)
        .where(Label.id.in_([source_id, target_id]), Label.household_id == household_id)
        .order_by(Label.id)
        .with_for_update()
    )
    labels = {label.id: label for label in rows}
    if len(labels) != 2:
        raise HTTPException(status_code=404, detail="Label not found")
    await _rewrite_saved_references(
        db, household_id, labels[source_id].name, labels[target_id].name
    )
    source_links = (
        select(TransactionLabel.transaction_id, Label.id)
        .join(Transaction, Transaction.id == TransactionLabel.transaction_id)
        .join(Label, Label.id == target_id)
        .where(
            TransactionLabel.label_id == source_id,
            Transaction.household_id == household_id,
            Label.household_id == household_id,
        )
    )
    await db.execute(
        insert(TransactionLabel)
        .from_select(["transaction_id", "label_id"], source_links)
        .on_conflict_do_nothing()
    )
    await db.delete(labels[source_id])
    await db.flush()
    return {
        **await _catalog_item(db, household_id, target_id),
        "mergedLabelId": source_id,
    }
