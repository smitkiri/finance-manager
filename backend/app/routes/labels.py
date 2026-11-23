from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_household_id
from app.schemas.label import LabelMergeRequest, LabelRenameRequest
from app.utils.labels import list_label_definitions, merge_labels, rename_label

router = APIRouter(prefix="/api/labels", tags=["labels"])


@router.get("")
async def get_labels(
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    return {
        "labels": [
            item["name"] for item in await list_label_definitions(db, household_id)
        ]
    }


@router.get("/catalog")
async def get_catalog(
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    return {"labels": await list_label_definitions(db, household_id)}


@router.patch("/{label_id}")
async def patch_label(
    label_id: str,
    body: LabelRenameRequest,
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    item = await rename_label(db, household_id, label_id, body.name)
    await db.commit()
    return item


@router.post("/{source_id}/merge")
async def merge_label(
    source_id: str,
    body: LabelMergeRequest,
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    item = await merge_labels(db, household_id, source_id, body.targetId)
    await db.commit()
    return item
