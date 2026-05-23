"""Teller bank integration routes.

Ports legacy/routes/teller.js to FastAPI. All endpoints maintain
identical URL paths and JSON response shapes for frontend compatibility.
"""

import os
import secrets
import time
import uuid
from datetime import UTC, datetime, timedelta
from datetime import date as date_type
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies.household import require_household_id
from app.models.account import Account, AccountBalance
from app.models.category import Category
from app.models.import_session import ImportSession
from app.models.metadata import Metadata
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.teller import (
    CategoryMappingsUpdateRequest,
    DisconnectRequest,
    EnrollRequest,
    ImportTransactionsRequest,
    ManageAccountsRequest,
    PreviewAccountsRequest,
    PreviewImportRequest,
    UpdateTokenRequest,
)
from app.utils.category_matcher import find_similar_category
from app.utils.teller_client import TellerClient
from app.utils.transfer_detection import detect_transfers

router = APIRouter(prefix="/api/teller", tags=["teller"])

UNCATEGORIZED = "Uncategorized"

# In-memory preview cache (matches Express behavior)
_import_preview_cache: dict[str, dict] = {}


def _clean_expired_previews() -> None:
    now = time.time()
    expired = [k for k, v in _import_preview_cache.items() if v["expires_at"] < now]
    for k in expired:
        del _import_preview_cache[k]


def _missing_teller_credential_files() -> list[str]:
    """Return the list of configured Teller cert/key paths that don't exist on
    disk. Caller must ensure ``settings.is_teller_enabled`` is True (so the
    paths are non-None)."""
    cert_path = settings.finance_manager_teller_cert
    key_path = settings.finance_manager_teller_private_key
    assert cert_path is not None
    assert key_path is not None
    return [p for p in (cert_path, key_path) if not os.path.isfile(p)]


def _get_teller_client() -> TellerClient:
    # Only called when is_teller_enabled is True, so these are guaranteed non-None
    cert_path = settings.finance_manager_teller_cert
    key_path = settings.finance_manager_teller_private_key
    assert cert_path is not None
    assert key_path is not None
    missing = _missing_teller_credential_files()
    if missing:
        # httpx would raise [Errno 2] No such file or directory at request time;
        # surface a clearer error here naming the missing files so operators
        # can fix the deployment (e.g. TELLER_SECRETS_PATH bind mount).
        raise FileNotFoundError(
            "Teller credential files not found: "
            + ", ".join(missing)
            + ". Verify the cert/key paths and the TELLER_SECRETS_PATH mount."
        )
    return TellerClient(cert_path=cert_path, key_path=key_path)


def check_credentials_at_startup() -> None:
    """Fail app startup if Teller is enabled but credential files are missing.

    Without this, the misconfiguration is only discovered when a user clicks
    refresh-balances and httpx tries to load the cert tuple. Failing startup
    makes the deploy unhealthy until the operator fixes the cert/key paths or
    the TELLER_SECRETS_PATH mount.
    """
    if not settings.is_teller_enabled:
        return
    missing = _missing_teller_credential_files()
    if missing:
        raise FileNotFoundError(
            "Teller integration is enabled but credential files are missing: "
            + ", ".join(missing)
            + ". Verify the cert/key paths and the TELLER_SECRETS_PATH mount."
        )


async def _read_enrollments(db: AsyncSession) -> list[dict]:
    """Read enrollments from metadata, with backward-compat migration."""
    result = await db.execute(
        select(Metadata).where(Metadata.key == "teller_enrollments")
    )
    meta = result.scalar_one_or_none()
    if meta:
        return meta.value if isinstance(meta.value, list) else []

    # Fall back to old single-enrollment key and migrate
    result = await db.execute(
        select(Metadata).where(Metadata.key == "teller_enrollment")
    )
    old_meta = result.scalar_one_or_none()
    if old_meta:
        old = old_meta.value
        migrated = [
            {
                "accessToken": old.get("accessToken"),
                "userId": old.get("userId"),
                "enrollmentId": old.get("enrollmentId"),
                "institutionName": None,
                "connectedAt": datetime.now(UTC).isoformat(),
            }
        ]
        await _write_enrollments(db, migrated)
        await db.execute(delete(Metadata).where(Metadata.key == "teller_enrollment"))
        await db.flush()
        return migrated

    return []


async def _write_enrollments(db: AsyncSession, enrollments: list[dict]) -> None:
    """Upsert enrollments JSON array into metadata."""
    result = await db.execute(
        select(Metadata).where(Metadata.key == "teller_enrollments")
    )
    meta = result.scalar_one_or_none()
    if meta:
        meta.value = enrollments
    else:
        db.add(Metadata(key="teller_enrollments", value=enrollments))
    await db.flush()


async def _fetch_teller_transactions_in_range(
    teller: TellerClient,
    access_token: str,
    teller_account_id: str,
    start_date: str,
    end_date: str,
) -> list[dict]:
    """Fetch posted transactions from Teller within a date range.

    Teller returns transactions in reverse-chronological order.
    We paginate and break early once past start_date.
    """
    transactions: list[dict] = []
    from_id: str | None = None

    while True:
        path = f"/accounts/{teller_account_id}/transactions?count=100"
        if from_id:
            path += f"&from_id={from_id}"

        status, data = await teller.request(path, access_token)
        if status != 200:
            raise RuntimeError(
                f"Teller API error {status} fetching transactions"
                f" for account {teller_account_id}"
            )

        batch = data if isinstance(data, list) else []
        for tx in batch:
            if tx["date"] < start_date:
                return transactions
            if tx["date"] <= end_date and tx.get("status") == "posted":
                transactions.append(tx)

        if len(batch) < 100:
            break
        from_id = batch[-1]["id"]

    return transactions


async def _resolve_user_id(
    db: AsyncSession, user_id: str | None, household_id: str | None = None
) -> str:
    """Resolve a valid user ID, falling back to the first user in the (household).

    When `household_id` is provided, lookup is scoped to that household.
    """
    if user_id:
        stmt = select(User).where(User.id == user_id)
        if household_id is not None:
            stmt = stmt.where(User.household_id == household_id)
        result = await db.execute(stmt)
        if result.scalar_one_or_none():
            return user_id

    stmt = select(User).order_by(User.created_at).limit(1)
    if household_id is not None:
        stmt = (
            select(User)
            .where(User.household_id == household_id)
            .order_by(User.created_at)
            .limit(1)
        )
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    return user.id if user else "default-user"


# --- Endpoints ---


@router.get("/config")
async def teller_config(db: AsyncSession = Depends(get_db)):
    if not settings.is_teller_enabled:
        return {"enabled": False, "enrollments": []}

    try:
        enrollments = await _read_enrollments(db)

        # For enrollments missing userId, look it up from the accounts table
        enrollment_ids = [
            e["enrollmentId"]
            for e in enrollments
            if not e.get("userId") and e.get("enrollmentId")
        ]
        account_user_map: dict[str, str] = {}
        if enrollment_ids:
            result = await db.execute(
                text(
                    "SELECT DISTINCT ON (teller_enrollment_id) "
                    "teller_enrollment_id, created_by_user_id "
                    "FROM accounts "
                    "WHERE teller_enrollment_id = ANY(:ids) "
                    "AND created_by_user_id IS NOT NULL"
                ),
                {"ids": enrollment_ids},
            )
            for row in result.all():
                account_user_map[row.teller_enrollment_id] = row.created_by_user_id

        return {
            "enabled": True,
            "applicationId": settings.finance_manager_teller_app_id,
            "enrollments": [
                {
                    "enrollmentId": e.get("enrollmentId"),
                    "institutionName": e.get("institutionName"),
                    "connectedAt": e.get("connectedAt"),
                    "userId": e.get("userId")
                    or account_user_map.get(e.get("enrollmentId", "")),
                }
                for e in enrollments
            ],
        }
    except Exception as exc:
        print(f"Error checking teller config: {exc}")
        return JSONResponse(
            status_code=500, content={"error": "Failed to check teller config"}
        )


@router.get("/enrollment-token/{enrollmentId}")
async def get_enrollment_token(enrollmentId: str, db: AsyncSession = Depends(get_db)):
    if not settings.is_teller_enabled:
        return JSONResponse(
            status_code=400, content={"error": "Teller integration not enabled"}
        )
    try:
        enrollments = await _read_enrollments(db)
        enrollment = next(
            (e for e in enrollments if e.get("enrollmentId") == enrollmentId),
            None,
        )
        if not enrollment:
            return JSONResponse(
                status_code=404, content={"error": "Enrollment not found"}
            )
        return {"accessToken": enrollment["accessToken"]}
    except Exception as exc:
        print(f"Error fetching enrollment token: {exc}")
        return JSONResponse(
            status_code=500, content={"error": "Failed to fetch enrollment token"}
        )


@router.put("/enrollment/{enrollmentId}/token")
async def update_enrollment_token(
    enrollmentId: str,
    body: UpdateTokenRequest,
    db: AsyncSession = Depends(get_db),
):
    if not settings.is_teller_enabled:
        return JSONResponse(
            status_code=400, content={"error": "Teller integration not enabled"}
        )
    try:
        enrollments = await _read_enrollments(db)
        idx = next(
            (
                i
                for i, e in enumerate(enrollments)
                if e.get("enrollmentId") == enrollmentId
            ),
            None,
        )
        if idx is None:
            return JSONResponse(
                status_code=404, content={"error": "Enrollment not found"}
            )
        enrollments[idx] = {**enrollments[idx], "accessToken": body.accessToken}
        await _write_enrollments(db, enrollments)
        await db.commit()
        return {"success": True}
    except Exception as exc:
        print(f"Error updating enrollment token: {exc}")
        return JSONResponse(
            status_code=500,
            content={"error": "Failed to update enrollment token"},
        )


@router.post("/preview-accounts")
async def preview_accounts(
    body: PreviewAccountsRequest, db: AsyncSession = Depends(get_db)
):
    if not settings.is_teller_enabled:
        return JSONResponse(
            status_code=400, content={"error": "Teller integration not enabled"}
        )
    try:
        teller = _get_teller_client()
        status, data = await teller.request("/accounts", body.accessToken)
        if status != 200:
            return JSONResponse(
                status_code=502,
                content={"error": "Failed to fetch accounts from Teller"},
            )
        accounts = data if isinstance(data, list) else []
        return [
            {
                "id": a["id"],
                "name": a["name"],
                "type": a["type"],
                "subtype": a.get("subtype"),
            }
            for a in accounts
        ]
    except Exception as exc:
        print(f"Error previewing Teller accounts: {exc}")
        return JSONResponse(
            status_code=500, content={"error": "Failed to preview accounts"}
        )


@router.post("/enroll")
async def enroll(
    body: EnrollRequest,
    household_id: str = Depends(require_household_id),
    db: AsyncSession = Depends(get_db),
):
    try:
        enrollments = await _read_enrollments(db)

        entry = {
            "accessToken": body.accessToken,
            "userId": body.userId,
            "enrollmentId": body.enrollmentId,
            "institutionName": body.institutionName,
            "connectedAt": datetime.now(UTC).isoformat(),
        }

        idx = next(
            (
                i
                for i, e in enumerate(enrollments)
                if e.get("enrollmentId") == body.enrollmentId
            ),
            None,
        )
        if idx is not None:
            enrollments[idx] = entry
        else:
            enrollments.append(entry)
        await _write_enrollments(db, enrollments)

        # Create account records for selected accounts
        if body.selectedAccounts:
            account_user_id = await _resolve_user_id(db, body.userId, household_id)

            for acct in body.selectedAccounts:
                result = await db.execute(
                    select(Account).where(
                        Account.teller_account_id == acct.tellerAccountId,
                        Account.household_id == household_id,
                    )
                )
                existing = result.scalar_one_or_none()
                if not existing:
                    account_id = hex(int(time.time() * 1000))[2:] + secrets.token_hex(4)
                    db.add(
                        Account(
                            id=account_id,
                            household_id=household_id,
                            created_by_user_id=account_user_id,
                            name=acct.alias,
                            type=acct.accountType,
                            teller_account_id=acct.tellerAccountId,
                            teller_enrollment_id=body.enrollmentId,
                        )
                    )
                else:
                    existing.name = acct.alias
                    existing.type = acct.accountType
                    existing.teller_enrollment_id = body.enrollmentId

        await db.commit()
        return {"success": True}
    except Exception as exc:
        print(f"Error saving teller enrollment: {exc}")
        return JSONResponse(
            status_code=500, content={"error": "Failed to save enrollment"}
        )


@router.post("/disconnect")
async def disconnect(
    body: DisconnectRequest,
    household_id: str = Depends(require_household_id),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await db.execute(
            delete(Account)
            .where(
                Account.teller_enrollment_id == body.enrollmentId,
                Account.household_id == household_id,
            )
            .returning(Account.id)
        )
        deleted_count = len(result.all())

        enrollments = await _read_enrollments(db)
        updated = [e for e in enrollments if e.get("enrollmentId") != body.enrollmentId]
        await _write_enrollments(db, updated)
        await db.commit()

        return {"success": True, "accountsDeleted": deleted_count}
    except Exception as exc:
        print(f"Error disconnecting teller enrollment: {exc}")
        return JSONResponse(
            status_code=500,
            content={"error": "Failed to disconnect enrollment"},
        )


@router.get("/enrollments/{enrollmentId}/preview-accounts")
async def enrollment_preview_accounts(
    enrollmentId: str, db: AsyncSession = Depends(get_db)
):
    try:
        enrollments = await _read_enrollments(db)
        enrollment = next(
            (e for e in enrollments if e.get("enrollmentId") == enrollmentId), None
        )
        if not enrollment:
            return JSONResponse(
                status_code=404, content={"error": "Enrollment not found"}
            )
        teller = _get_teller_client()
        status, data = await teller.request("/accounts", enrollment["accessToken"])
        if status != 200:
            return JSONResponse(
                status_code=502,
                content={"error": "Failed to fetch accounts from Teller"},
            )
        accounts = data if isinstance(data, list) else []
        return [
            {
                "id": a["id"],
                "name": a["name"],
                "type": a["type"],
                "subtype": a.get("subtype"),
            }
            for a in accounts
        ]
    except Exception as exc:
        print(f"Error previewing accounts for enrollment: {exc}")
        return JSONResponse(
            status_code=500, content={"error": "Failed to preview accounts"}
        )


@router.post("/enrollments/{enrollmentId}/manage-accounts")
async def manage_accounts(
    enrollmentId: str,
    body: ManageAccountsRequest,
    household_id: str = Depends(require_household_id),
    db: AsyncSession = Depends(get_db),
):
    try:
        enrollments = await _read_enrollments(db)
        enrollment = next(
            (e for e in enrollments if e.get("enrollmentId") == enrollmentId), None
        )
        if not enrollment:
            return JSONResponse(
                status_code=404, content={"error": "Enrollment not found"}
            )

        account_user_id = await _resolve_user_id(db, body.userId, household_id)

        # Remove accounts
        removed = 0
        for teller_account_id in body.toRemove:
            result = await db.execute(
                delete(Account)
                .where(
                    Account.teller_account_id == teller_account_id,
                    Account.teller_enrollment_id == enrollmentId,
                    Account.household_id == household_id,
                )
                .returning(Account.id)
            )
            removed += len(result.all())

        # Add new accounts
        added = 0
        for acct in body.toAdd:
            result = await db.execute(
                select(Account).where(
                    Account.teller_account_id == acct.tellerAccountId,
                    Account.household_id == household_id,
                )
            )
            if not result.scalar_one_or_none():
                account_id = hex(int(time.time() * 1000))[2:] + secrets.token_hex(4)
                db.add(
                    Account(
                        id=account_id,
                        household_id=household_id,
                        created_by_user_id=account_user_id,
                        name=acct.alias,
                        type=acct.accountType,
                        teller_account_id=acct.tellerAccountId,
                        teller_enrollment_id=enrollmentId,
                    )
                )
                added += 1

        await db.commit()
        return {"success": True, "added": added, "removed": removed}
    except Exception as exc:
        print(f"Error managing accounts for enrollment: {exc}")
        return JSONResponse(
            status_code=500, content={"error": "Failed to manage accounts"}
        )


@router.post("/refresh-balances")
async def refresh_balances(
    household_id: str = Depends(require_household_id),
    db: AsyncSession = Depends(get_db),
):
    if not settings.is_teller_enabled:
        return JSONResponse(
            status_code=400, content={"error": "Teller integration not enabled"}
        )
    try:
        enrollments = await _read_enrollments(db)
        if not enrollments:
            return JSONResponse(
                status_code=400, content={"error": "Not enrolled with Teller"}
            )

        today = date_type.today().isoformat()
        refreshed = 0
        reconnect_required: list[str] = []
        try:
            teller = _get_teller_client()
        except FileNotFoundError as exc:
            print(f"Error refreshing Teller balances: {exc}")
            return JSONResponse(status_code=503, content={"error": str(exc)})

        for enrollment in enrollments:
            access_token = enrollment["accessToken"]
            status, data = await teller.request("/accounts", access_token)
            if status != 200:
                reconnect_required.append(
                    enrollment.get("institutionName") or "Bank Account"
                )
                continue

            teller_accounts = data if isinstance(data, list) else []
            for teller_account in teller_accounts:
                # Only refresh accounts the user explicitly added to this household
                result = await db.execute(
                    select(Account).where(
                        Account.teller_account_id == teller_account["id"],
                        Account.household_id == household_id,
                    )
                )
                existing = result.scalar_one_or_none()
                if not existing:
                    continue

                bal_status, bal_data = await teller.request(
                    f"/accounts/{teller_account['id']}/balances", access_token
                )
                if bal_status != 200:
                    continue

                is_credit = teller_account.get("type") == "credit"
                if is_credit:
                    balance = float(
                        bal_data.get("ledger") or bal_data.get("available") or 0
                    )
                else:
                    balance = float(
                        bal_data.get("available") or bal_data.get("ledger") or 0
                    )

                balance_id = hex(int(time.time() * 1000))[2:] + secrets.token_hex(4)
                db.add(
                    AccountBalance(
                        id=balance_id,
                        account_id=existing.id,
                        balance=Decimal(str(balance)),
                        date=date_type.fromisoformat(today),
                        note="Auto-refreshed from Teller",
                    )
                )
                refreshed += 1

        await db.commit()
        result_data: dict[str, Any] = {"refreshed": refreshed}
        if reconnect_required:
            result_data["reconnectRequired"] = reconnect_required
        return result_data
    except Exception as exc:
        print(f"Error refreshing Teller balances: {exc}")
        return JSONResponse(
            status_code=500, content={"error": "Failed to refresh balances"}
        )


@router.get("/category-mappings")
async def get_category_mappings(db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(
            select(Metadata).where(Metadata.key == "teller_category_mappings")
        )
        meta = result.scalar_one_or_none()
        saved_mappings: dict[str, str] = meta.value if meta else {}

        # Count transactions per original Teller category
        count_result = await db.execute(
            text(
                "SELECT metadata->'teller'->'details'->>'category' AS teller_category, "
                "COUNT(*)::int AS count "
                "FROM transactions "
                "WHERE metadata->'teller'->'details'->>'category' IS NOT NULL "
                "GROUP BY teller_category"
            )
        )
        count_map = {row.teller_category: row.count for row in count_result.all()}

        mappings = [
            {
                "tellerCategory": teller_cat,
                "userCategory": user_cat,
                "transactionCount": count_map.get(teller_cat, 0),
            }
            for teller_cat, user_cat in saved_mappings.items()
        ]

        return {"mappings": mappings}
    except Exception as exc:
        print(f"Error loading Teller category mappings: {exc}")
        return JSONResponse(
            status_code=500,
            content={"error": "Failed to load category mappings"},
        )


@router.put("/category-mappings")
async def update_category_mappings(
    body: CategoryMappingsUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        # Load existing mappings to detect changes
        result = await db.execute(
            select(Metadata).where(Metadata.key == "teller_category_mappings")
        )
        meta = result.scalar_one_or_none()
        existing_mappings: dict[str, str] = meta.value if meta else {}

        # Build new mappings
        new_mappings: dict[str, str] = {}
        for m in body.mappings:
            if m.tellerCategory and m.userCategory:
                new_mappings[m.tellerCategory] = m.userCategory

        # Re-categorize transactions where mapping changed
        for teller_cat, user_cat in new_mappings.items():
            if existing_mappings.get(teller_cat) != user_cat:
                await db.execute(
                    text(
                        "UPDATE transactions SET category = :cat "
                        "WHERE metadata->'teller'->'details'->>'category' = :teller_cat"
                    ),
                    {"cat": user_cat, "teller_cat": teller_cat},
                )

        # Persist new mappings
        if meta:
            meta.value = new_mappings
        else:
            db.add(Metadata(key="teller_category_mappings", value=new_mappings))

        await db.commit()
        return {"success": True, "updated": len(new_mappings)}
    except Exception as exc:
        print(f"Error updating Teller category mappings: {exc}")
        return JSONResponse(
            status_code=500,
            content={"error": "Failed to update category mappings"},
        )


@router.post("/preview-import")
async def preview_import(
    body: PreviewImportRequest,
    household_id: str = Depends(require_household_id),
    db: AsyncSession = Depends(get_db),
):
    if not settings.is_teller_enabled:
        return JSONResponse(
            status_code=400, content={"error": "Teller integration not enabled"}
        )
    if not body.accountIds:
        return JSONResponse(
            status_code=400, content={"error": "accountIds is required"}
        )
    if not body.startDate or not body.endDate:
        return JSONResponse(
            status_code=400, content={"error": "startDate and endDate are required"}
        )
    if body.startDate > body.endDate:
        return JSONResponse(
            status_code=400,
            content={"error": "startDate must be before endDate"},
        )

    _clean_expired_previews()

    try:
        enrollments = await _read_enrollments(db)
        teller = _get_teller_client()

        # Load categories, saved mappings, and recent transactions for this household
        cat_result = await db.execute(
            select(Category).where(Category.household_id == household_id)
        )
        existing_category_names = {c.name for c in cat_result.scalars().all()}
        existing_category_names.add(UNCATEGORIZED)

        map_result = await db.execute(
            select(Metadata).where(Metadata.key == "teller_category_mappings")
        )
        map_meta = map_result.scalar_one_or_none()
        saved_mappings: dict[str, str] = map_meta.value if map_meta else {}

        txn_result = await db.execute(
            select(Transaction)
            .where(Transaction.household_id == household_id)
            .order_by(Transaction.date.desc())
            .limit(500)
        )
        existing_expenses = [
            {
                "id": t.id,
                "date": t.date,
                "description": t.description,
                "category": t.category,
            }
            for t in txn_result.scalars().all()
        ]

        reconnect_required: list[str] = []
        preview_accounts: list[dict] = []

        for account_id in body.accountIds:
            result = await db.execute(
                select(Account).where(
                    Account.id == account_id,
                    Account.household_id == household_id,
                )
            )
            account = result.scalar_one_or_none()
            if not account:
                continue

            enrollment = next(
                (
                    e
                    for e in enrollments
                    if e.get("enrollmentId") == account.teller_enrollment_id
                ),
                None,
            )
            if not enrollment or not account.teller_account_id:
                continue

            try:
                transactions = await _fetch_teller_transactions_in_range(
                    teller,
                    enrollment["accessToken"],
                    account.teller_account_id,
                    body.startDate,
                    body.endDate,
                )
            except RuntimeError as err:
                if "404" in str(err):
                    reconnect_required.append(account.name)
                    continue
                raise

            # Deduplicate against existing transactions
            teller_ids = [tx["id"] for tx in transactions]
            existing_ids: set[str] = set()
            if teller_ids:
                dup_result = await db.execute(
                    text(
                        "SELECT metadata->>'tellerTransactionId' AS tid "
                        "FROM transactions "
                        "WHERE household_id = :hid "
                        "AND metadata->>'tellerTransactionId' = ANY(:ids)"
                    ),
                    {"hid": household_id, "ids": teller_ids},
                )
                existing_ids = {row.tid for row in dup_result.all()}

            new_txs = [tx for tx in transactions if tx["id"] not in existing_ids]
            dup_txs = [tx for tx in transactions if tx["id"] in existing_ids]

            preview_accounts.append(
                {
                    "accountId": account_id,
                    "accountName": account.name,
                    "accountType": account.type,
                    "userId": account.created_by_user_id,
                    "tellerAccountId": account.teller_account_id,
                    "newTransactions": new_txs,
                    "newCount": len(new_txs),
                    "duplicateCount": len(dup_txs),
                }
            )

        if reconnect_required:
            return JSONResponse(
                status_code=400,
                content={
                    "error": "reconnect_required",
                    "accounts": reconnect_required,
                },
            )

        # Compute categories for each new transaction
        category_map: dict[str, str] = {}
        all_assigned_categories: set[str] = set()

        for account in preview_accounts:
            for tx in account["newTransactions"]:
                description = tx.get("details", {}).get("counterparty", {}).get(
                    "name"
                ) or tx.get("description", "")
                teller_category = tx.get("details", {}).get("category")

                if teller_category:
                    category = saved_mappings.get(teller_category, teller_category)
                else:
                    category = (
                        find_similar_category(description, existing_expenses)
                        or UNCATEGORIZED
                    )

                category_map[tx["id"]] = category
                all_assigned_categories.add(category)

        new_categories = [
            c for c in all_assigned_categories if c not in existing_category_names
        ]

        preview_token = secrets.token_hex(16)
        _import_preview_cache[preview_token] = {
            "accounts": preview_accounts,
            "category_map": category_map,
            "expires_at": time.time() + 600,
        }

        return {
            "previewToken": preview_token,
            "accounts": [
                {
                    "accountId": a["accountId"],
                    "accountName": a["accountName"],
                    "newCount": a["newCount"],
                    "duplicateCount": a["duplicateCount"],
                }
                for a in preview_accounts
            ],
            "newCategories": new_categories,
        }
    except Exception as exc:
        print(f"Error previewing Teller import: {exc}")
        return JSONResponse(
            status_code=500, content={"error": "Failed to preview import"}
        )


@router.post("/import-transactions")
async def import_transactions(
    body: ImportTransactionsRequest,
    household_id: str = Depends(require_household_id),
    db: AsyncSession = Depends(get_db),
):
    _clean_expired_previews()
    preview = _import_preview_cache.get(body.previewToken)
    if not preview:
        return JSONResponse(
            status_code=400,
            content={"error": "Preview expired or not found. Please preview again."},
        )

    try:
        # Save any new user-provided category mappings
        if body.userMappings:
            result = await db.execute(
                select(Metadata).where(Metadata.key == "teller_category_mappings")
            )
            meta = result.scalar_one_or_none()
            existing_mappings: dict[str, str] = meta.value if meta else {}
            merged = {**existing_mappings, **body.userMappings}
            if meta:
                meta.value = merged
            else:
                db.add(Metadata(key="teller_category_mappings", value=merged))
            await db.flush()

        preview_accounts = preview["accounts"]
        category_map = preview["category_map"]

        sessions: list[dict] = []
        all_new_expenses: list[dict] = []

        for account in preview_accounts:
            if not account["newTransactions"]:
                continue

            session_id = str(uuid.uuid4())
            db.add(
                ImportSession(
                    id=session_id,
                    household_id=household_id,
                    created_by_user_id=account.get("userId"),
                    source_name=f"Teller: {account['accountName']}",
                    transaction_count=len(account["newTransactions"]),
                )
            )

            for tx in account["newTransactions"]:
                description = tx.get("description") or (
                    tx.get("details", {}).get("counterparty", {}).get("name", "")
                )
                base_category = category_map.get(tx["id"], UNCATEGORIZED)
                category = body.userMappings.get(base_category, base_category)

                expense_id = str(uuid.uuid4())
                amount = abs(float(tx["amount"]))

                # Determine type based on account type and transaction direction
                if account["accountType"] == "liability":
                    tx_type = "expense" if tx.get("type") == "credit" else "income"
                else:
                    tx_type = "expense" if tx.get("type") == "debit" else "income"

                metadata = {
                    "tellerTransactionId": tx["id"],
                    "sourceName": f"Teller: {account['accountName']}",
                    "importedAt": str(date_type.today()),
                    "teller": {"details": tx.get("details", {})},
                }

                db.add(
                    Transaction(
                        id=expense_id,
                        date=date_type.fromisoformat(tx["date"]),
                        description=description,
                        category=category,
                        amount=Decimal(str(amount)),
                        type=tx_type,
                        household_id=household_id,
                        created_by_user_id=account.get("userId") or None,
                        labels=[],
                        metadata_=metadata,
                        transfer_info=None,
                        excluded_from_calculations=False,
                        import_id=session_id,
                    )
                )

                all_new_expenses.append(
                    {
                        "id": expense_id,
                        "date": tx["date"],
                        "description": description,
                        "category": category,
                        "amount": amount,
                        "type": tx_type,
                        "user": account.get("userId") or "",
                        "metadata": metadata,
                    }
                )

            sessions.append(
                {
                    "accountId": account["accountId"],
                    "accountName": account["accountName"],
                    "sessionId": session_id,
                    "added": len(account["newTransactions"]),
                    "skipped": account["duplicateCount"],
                }
            )

        await db.commit()

        # Transfer detection on nearby transactions (after commit)
        if all_new_expenses:
            import_dates = sorted(e["date"] for e in all_new_expenses)
            window_start = date_type.fromisoformat(import_dates[0])
            window_end = date_type.fromisoformat(import_dates[-1])

            window_start -= timedelta(days=3)
            window_end += timedelta(days=3)

            result = await db.execute(
                select(Transaction).where(
                    Transaction.date.between(window_start, window_end)
                )
            )
            all_txns = result.scalars().all()
            all_dicts = [
                {
                    "id": t.id,
                    "date": t.date,
                    "description": t.description,
                    "category": t.category,
                    "amount": float(t.amount),
                    "type": t.type,
                    "user": t.created_by_user_id,
                    "labels": t.labels or [],
                    "metadata": t.metadata_ or {},
                    "transferInfo": t.transfer_info,
                    "excludedFromCalculations": t.excluded_from_calculations,
                    "importId": t.import_id,
                }
                for t in all_txns
            ]

            detection = detect_transfers(all_dicts)
            for expense in detection["updatedTransactions"]:
                if expense.get("transferInfo"):
                    result = await db.execute(
                        select(Transaction).where(Transaction.id == expense["id"])
                    )
                    txn = result.scalar_one_or_none()
                    if txn:
                        txn.transfer_info = expense["transferInfo"]
                        txn.excluded_from_calculations = expense.get(
                            "excludedFromCalculations", False
                        )
            await db.commit()

        _import_preview_cache.pop(body.previewToken, None)
        return {"sessions": sessions}
    except Exception as exc:
        print(f"Error importing Teller transactions: {exc}")
        return JSONResponse(
            status_code=500, content={"error": "Failed to import transactions"}
        )
