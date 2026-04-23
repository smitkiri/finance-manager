"""Teller bank integration routes.

Ports legacy/routes/teller.js to FastAPI. All endpoints maintain
identical URL paths and JSON response shapes for frontend compatibility.
"""

import secrets
import time
from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.account import Account
from app.models.metadata import Metadata
from app.models.user import User
from app.schemas.teller import (
    DisconnectRequest,
    EnrollRequest,
    PreviewAccountsRequest,
    UpdateTokenRequest,
)
from app.utils.teller_client import TellerClient

router = APIRouter(prefix="/api/teller", tags=["teller"])

UNCATEGORIZED = "Uncategorized"

# In-memory preview cache (matches Express behavior)
_import_preview_cache: dict[str, dict] = {}


def _clean_expired_previews() -> None:
    now = time.time()
    expired = [k for k, v in _import_preview_cache.items() if v["expires_at"] < now]
    for k in expired:
        del _import_preview_cache[k]


def _get_teller_client() -> TellerClient:
    # Only called when is_teller_enabled is True, so these are guaranteed non-None
    assert settings.finance_manager_teller_cert is not None
    assert settings.finance_manager_teller_private_key is not None
    return TellerClient(
        cert_path=settings.finance_manager_teller_cert,
        key_path=settings.finance_manager_teller_private_key,
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


async def _resolve_user_id(db: AsyncSession, user_id: str | None) -> str:
    """Resolve a valid user ID, falling back to the first user in the DB."""
    if user_id:
        result = await db.execute(select(User).where(User.id == user_id))
        if result.scalar_one_or_none():
            return user_id
    result = await db.execute(select(User).order_by(User.created_at).limit(1))
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
                    "teller_enrollment_id, user_id "
                    "FROM accounts "
                    "WHERE teller_enrollment_id = ANY(:ids) "
                    "AND user_id IS NOT NULL"
                ),
                {"ids": enrollment_ids},
            )
            for row in result.all():
                account_user_map[row.teller_enrollment_id] = row.user_id

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
async def enroll(body: EnrollRequest, db: AsyncSession = Depends(get_db)):
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
            account_user_id = await _resolve_user_id(db, body.userId)

            for acct in body.selectedAccounts:
                result = await db.execute(
                    select(Account).where(
                        Account.teller_account_id == acct.tellerAccountId
                    )
                )
                existing = result.scalar_one_or_none()
                if not existing:
                    account_id = hex(int(time.time() * 1000))[2:] + secrets.token_hex(4)
                    db.add(
                        Account(
                            id=account_id,
                            user_id=account_user_id,
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
async def disconnect(body: DisconnectRequest, db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(
            delete(Account)
            .where(Account.teller_enrollment_id == body.enrollmentId)
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
