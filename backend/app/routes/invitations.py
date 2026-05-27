"""Invitations: create, list, revoke, lookup-by-token, accept."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies.auth import get_current_household_id, get_current_user
from app.models import Invitation, User
from app.schemas.invitation import (
    InvitationCreated,
    InvitationCreateRequest,
    InvitationInviter,
)
from app.utils.invitation_tokens import generate_invitation_token

router = APIRouter(prefix="/api/invitations", tags=["invitations"])


def _refuse_in_demo_mode() -> None:
    if settings.finance_manager_demo_mode:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Disabled in demo mode",
        )


@router.post("", response_model=InvitationCreated, status_code=201)
async def create_invitation(
    payload: InvitationCreateRequest,
    current_user: User = Depends(get_current_user),
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
) -> InvitationCreated:
    _refuse_in_demo_mode()

    target_email = payload.email.lower()
    if target_email == current_user.email.lower():
        raise HTTPException(status_code=400, detail="You can't invite yourself")

    existing_member = (
        await db.execute(
            select(User).where(
                User.household_id == household_id,
                func.lower(User.email) == target_email,
            )
        )
    ).scalar_one_or_none()
    if existing_member is not None:
        raise HTTPException(
            status_code=409,
            detail="User is already a member of this household",
        )

    # Auto-revoke any prior live invite to the same email in this household
    await db.execute(
        update(Invitation)
        .where(
            Invitation.household_id == household_id,
            func.lower(Invitation.email) == target_email,
            Invitation.consumed_at.is_(None),
            Invitation.revoked_at.is_(None),
        )
        .values(revoked_at=func.now())
    )

    # DB columns are TIMESTAMP (naive). Keep app-layer datetimes naive UTC.
    now = datetime.now(UTC).replace(tzinfo=None)
    invite = Invitation(
        id=str(uuid.uuid4()),
        household_id=household_id,
        email=payload.email,
        token=generate_invitation_token(),
        invited_by_user_id=current_user.id,
        expires_at=now + timedelta(days=7),
    )
    db.add(invite)
    await db.commit()
    await db.refresh(invite)

    return InvitationCreated(
        id=invite.id,
        email=invite.email,
        status="pending",
        created_at=invite.created_at,
        expires_at=invite.expires_at,
        invited_by=InvitationInviter(id=current_user.id, name=current_user.name),
        token=invite.token,
    )
