from fastapi import APIRouter, Depends
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.import_session import ImportSession
from app.models.source import Source
from app.models.transaction import Transaction
from app.schemas.data import DeleteSelectedRequest, UndoImportRequest
from app.utils.transfer_utils import run_detection

router = APIRouter(prefix="/api", tags=["data"])


@router.delete("/delete-all")
async def delete_all(db: AsyncSession = Depends(get_db)):
    await db.execute(delete(Transaction))
    await db.execute(delete(Source))
    await db.commit()
    return {"success": True}


@router.post("/delete-selected")
async def delete_selected(
    body: DeleteSelectedRequest,
    db: AsyncSession = Depends(get_db),
):
    if body.deleteTransactions:
        await db.execute(delete(Transaction))

    if body.deleteSources and body.sourceIds:
        await db.execute(delete(Source).where(Source.id.in_(body.sourceIds)))

    await db.commit()
    return {"success": True}


@router.post("/undo-import")
async def undo_import(
    body: UndoImportRequest,
    db: AsyncSession = Depends(get_db),
):
    # Count and delete transactions for this session
    result = await db.execute(
        select(Transaction).where(Transaction.import_id == body.sessionId)
    )
    session_txns = result.scalars().all()
    removed = len(session_txns)

    await db.execute(delete(Transaction).where(Transaction.import_id == body.sessionId))

    # Delete the import session
    await db.execute(delete(ImportSession).where(ImportSession.id == body.sessionId))

    # Re-run transfer detection on remaining transactions
    await db.flush()
    await run_detection(db, strip_existing=True)

    return {"success": True, "removed": removed}
