from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_household_id
from app.models.transfer_group import TransferGroup
from app.schemas.transfer import TransferGroupCreate, TransferGroupUpdate
from app.utils.transfer_groups import (
    GroupValidationError,
    create_group,
    dissolve_group,
    group_out,
    recompute_groups,
    set_members,
)
from app.utils.transfer_utils import run_detection

router = APIRouter(prefix="/api", tags=["transfers"])


async def _get_group(
    db: AsyncSession, group_id: str, household_id: str
) -> TransferGroup | None:
    result = await db.execute(
        select(TransferGroup).where(
            TransferGroup.id == group_id,
            TransferGroup.household_id == household_id,
        )
    )
    return result.scalar_one_or_none()


def _not_found() -> JSONResponse:
    return JSONResponse(status_code=404, content={"error": "Transfer group not found"})


@router.post("/transfer-groups", status_code=201)
async def create_transfer_group(
    body: TransferGroupCreate,
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    try:
        group = await create_group(db, household_id, body.anchorId, body.memberIds)
    except GroupValidationError as exc:
        return JSONResponse(status_code=400, content={"error": str(exc)})
    await db.commit()
    return await group_out(db, group)


@router.post("/transfer-groups/recompute")
async def recompute_transfer_groups(
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    """Recompute every group's allocation in this household (repair backstop)."""
    result = await db.execute(
        select(TransferGroup.id).where(TransferGroup.household_id == household_id)
    )
    group_ids = result.scalars().all()
    await recompute_groups(db, group_ids)
    await db.commit()
    return {"success": True, "groups": len(group_ids)}


@router.get("/transfer-groups/{group_id}")
async def get_transfer_group(
    group_id: str,
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    group = await _get_group(db, group_id, household_id)
    if group is None:
        return _not_found()
    return await group_out(db, group)


@router.patch("/transfer-groups/{group_id}")
async def update_transfer_group(
    group_id: str,
    body: TransferGroupUpdate,
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    group = await _get_group(db, group_id, household_id)
    if group is None:
        return _not_found()
    try:
        if body.includeInCalculations is not None:
            group.include_in_calculations = body.includeInCalculations
        if body.memberIds is not None:
            await set_members(db, group, body.memberIds)
        else:
            await recompute_groups(db, [group.id])
    except GroupValidationError as exc:
        return JSONResponse(status_code=400, content={"error": str(exc)})
    await db.commit()
    await db.refresh(group)
    return await group_out(db, group)


@router.delete("/transfer-groups/{group_id}")
async def delete_transfer_group(
    group_id: str,
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    group = await _get_group(db, group_id, household_id)
    if group is None:
        return _not_found()
    await dissolve_group(db, group.id)
    await db.commit()
    return {"success": True}


@router.post("/detect-transfers")
async def run_detect_transfers(
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    result = await run_detection(db, household_id=household_id)
    if result is None:
        return JSONResponse(status_code=404, content={"error": "No transactions found"})
    return result


@router.post("/rerun-transfer-detection")
async def rerun_transfer_detection(
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    """Re-detect transfers from scratch within this household."""
    result = await run_detection(db, strip_existing=True, household_id=household_id)
    if result is None:
        return JSONResponse(status_code=404, content={"error": "No transactions found"})
    return {**result, "message": "Transfer detection completed successfully"}
