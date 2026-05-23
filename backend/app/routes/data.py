from fastapi import APIRouter, Depends
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.household import require_household_id
from app.models.import_session import ImportSession
from app.models.source import Source
from app.models.transaction import Transaction
from app.schemas.data import DeleteSelectedRequest, UndoImportRequest
from app.utils.transfer_utils import run_detection

router = APIRouter(prefix="/api", tags=["data"])


@router.delete("/delete-all")
async def delete_all(
    household_id: str = Depends(require_household_id),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        delete(Transaction).where(Transaction.household_id == household_id)
    )
    await db.execute(delete(Source).where(Source.household_id == household_id))
    await db.commit()
    return {"success": True}


@router.post("/delete-selected")
async def delete_selected(
    body: DeleteSelectedRequest,
    household_id: str = Depends(require_household_id),
    db: AsyncSession = Depends(get_db),
):
    if body.deleteTransactions:
        await db.execute(
            delete(Transaction).where(Transaction.household_id == household_id)
        )

    if body.deleteSources and body.sourceIds:
        await db.execute(
            delete(Source).where(
                Source.household_id == household_id, Source.id.in_(body.sourceIds)
            )
        )

    await db.commit()
    return {"success": True}


@router.post("/undo-import")
async def undo_import(
    body: UndoImportRequest,
    household_id: str = Depends(require_household_id),
    db: AsyncSession = Depends(get_db),
):
    # Count and delete transactions for this session within the household
    result = await db.execute(
        select(Transaction).where(
            Transaction.import_id == body.sessionId,
            Transaction.household_id == household_id,
        )
    )
    session_txns = result.scalars().all()
    removed = len(session_txns)

    await db.execute(
        delete(Transaction).where(
            Transaction.import_id == body.sessionId,
            Transaction.household_id == household_id,
        )
    )

    # Delete the import session
    await db.execute(
        delete(ImportSession).where(
            ImportSession.id == body.sessionId,
            ImportSession.household_id == household_id,
        )
    )

    # Re-run transfer detection on remaining transactions in this household
    await db.flush()
    await run_detection(db, strip_existing=True, household_id=household_id)

    return {"success": True, "removed": removed}
