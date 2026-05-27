"""Invitations: create, list, revoke, lookup-by-token, accept."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies.auth import get_current_household_id, get_current_user
from app.models import (
    Account,
    AccountBalance,
    Category,
    Dashboard,
    DashboardPanel,
    DateRange,
    Household,
    ImportSession,
    Invitation,
    Report,
    Source,
    Transaction,
    User,
)
from app.schemas.auth import MeResponse
from app.schemas.household import HouseholdOut
from app.schemas.invitation import (
    InvitationAcceptRequest,
    InvitationCreated,
    InvitationCreateRequest,
    InvitationInviter,
    InvitationListItem,
    InvitationLookupResponse,
    InvitationStatus,
)
from app.schemas.user import UserOut
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


@router.get("", response_model=list[InvitationListItem])
async def list_invitations(
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
) -> list[InvitationListItem]:
    """Return pending invitations for the caller's household."""
    now = datetime.now(UTC).replace(tzinfo=None)
    rows = (
        await db.execute(
            select(Invitation, User)
            .outerjoin(User, User.id == Invitation.invited_by_user_id)
            .where(
                Invitation.household_id == household_id,
                Invitation.consumed_at.is_(None),
                Invitation.revoked_at.is_(None),
                Invitation.expires_at > now,
            )
            .order_by(Invitation.created_at.desc())
        )
    ).all()

    return [
        InvitationListItem(
            id=inv.id,
            email=inv.email,
            status="pending",
            created_at=inv.created_at,
            expires_at=inv.expires_at,
            invited_by=(
                InvitationInviter(id=inviter.id, name=inviter.name)
                if inviter is not None
                else None
            ),
        )
        for inv, inviter in rows
    ]


@router.delete("/{invite_id}", status_code=204)
async def revoke_invitation(
    invite_id: str,
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
) -> Response:
    _refuse_in_demo_mode()

    invite = (
        await db.execute(
            select(Invitation).where(
                Invitation.id == invite_id,
                Invitation.household_id == household_id,
            )
        )
    ).scalar_one_or_none()
    if invite is None:
        raise HTTPException(status_code=404, detail="Invitation not found")

    if invite.consumed_at is not None or invite.revoked_at is not None:
        raise HTTPException(status_code=409, detail="This invite cannot be revoked")

    # Expired invites are already dead but the UI calls revoke as the
    # canonical "remove from list" action — stamp revoked_at just the same.
    invite.revoked_at = datetime.now(UTC).replace(tzinfo=None)
    await db.commit()
    return Response(status_code=204)


def _derive_status(invite: Invitation, now: datetime) -> InvitationStatus:
    if invite.revoked_at is not None:
        return "revoked"
    if invite.consumed_at is not None:
        return "consumed"
    if invite.expires_at <= now:
        return "expired"
    return "pending"


@router.get("/lookup")
async def lookup_invitation(
    token: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
):
    """Public — used by the accept-invite landing page before sign-in."""
    row = (
        await db.execute(
            select(Invitation, Household, User)
            .join(Household, Household.id == Invitation.household_id)
            .outerjoin(User, User.id == Invitation.invited_by_user_id)
            .where(Invitation.token == token)
        )
    ).one_or_none()

    if row is None:
        raise HTTPException(status_code=404, detail="Invitation not found")

    invite, household, inviter = row
    now = datetime.now(UTC).replace(tzinfo=None)
    inv_status = _derive_status(invite, now)

    body = InvitationLookupResponse(
        household_name=household.name,
        inviter_name=inviter.name if inviter is not None else None,
        email=invite.email,
        status=inv_status,
        expires_at=invite.expires_at,
    ).model_dump(by_alias=True, mode="json")

    if inv_status != "pending":
        return JSONResponse(status_code=410, content=body)
    return body


@router.post("/accept", response_model=MeResponse)
async def accept_invitation(
    payload: InvitationAcceptRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MeResponse:
    _refuse_in_demo_mode()

    now = datetime.now(UTC).replace(tzinfo=None)

    invite = (
        await db.execute(
            select(Invitation)
            .where(Invitation.token == payload.token)
            .with_for_update()
        )
    ).scalar_one_or_none()

    if invite is None or _derive_status(invite, now) != "pending":
        raise HTTPException(status_code=410, detail="This invite is no longer valid")

    if invite.email.lower() != current_user.email.lower():
        raise HTTPException(
            status_code=403,
            detail="This invite is for a different email address",
        )

    if current_user.household_id == invite.household_id:
        raise HTTPException(status_code=409, detail="You're already in this household")

    old_household_id = current_user.household_id
    new_household_id = invite.household_id

    # 1. Move the user
    await db.execute(
        update(User)
        .where(User.id == current_user.id)
        .values(household_id=new_household_id)
    )

    # 2. Consume the invitation
    invite.consumed_at = now

    # 3. Revoke any outgoing invites the user issued in the old household.
    # In the sole-member case the old household and its invitations are
    # deleted below; this step is the explicit "still relevant" handling
    # for multi-member households.
    await db.execute(
        update(Invitation)
        .where(
            Invitation.invited_by_user_id == current_user.id,
            Invitation.household_id == old_household_id,
            Invitation.consumed_at.is_(None),
            Invitation.revoked_at.is_(None),
        )
        .values(revoked_at=now)
    )

    # 4. If the user was the sole member of the old household, wipe it
    remaining = (
        await db.execute(
            select(func.count())
            .select_from(User)
            .where(User.household_id == old_household_id)
        )
    ).scalar_one()

    if remaining == 0:
        # account_balances and dashboard_panels are scoped to their parent,
        # not to household_id directly — delete via subquery on the parent.
        await db.execute(
            delete(AccountBalance).where(
                AccountBalance.account_id.in_(
                    select(Account.id).where(Account.household_id == old_household_id)
                )
            )
        )
        await db.execute(
            delete(DashboardPanel).where(
                DashboardPanel.dashboard_id.in_(
                    select(Dashboard.id).where(
                        Dashboard.household_id == old_household_id
                    )
                )
            )
        )
        for model in (
            Transaction,
            ImportSession,
            Account,
            Category,
            Source,
            Dashboard,
            Report,
            DateRange,
        ):
            await db.execute(
                delete(model).where(model.household_id == old_household_id)
            )
        await db.execute(
            delete(Invitation).where(Invitation.household_id == old_household_id)
        )
        await db.execute(delete(Household).where(Household.id == old_household_id))

    await db.commit()

    await db.refresh(current_user)
    new_household = (
        await db.execute(select(Household).where(Household.id == new_household_id))
    ).scalar_one()

    return MeResponse(
        user=UserOut.from_orm_model(current_user),
        household=HouseholdOut.from_orm_model(new_household),
    )
