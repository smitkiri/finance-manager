from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.import_session import ImportSession
from app.models.transaction import Transaction
from app.schemas.import_session import ImportSessionOut
from app.utils.transfer_utils import run_detection

router = APIRouter(prefix="/api", tags=["import_sessions"])


@router.get("/import-sessions")
async def get_import_sessions(db: AsyncSession = Depends(get_db)):
    # Auto-delete sessions older than 6 months
    cutoff = datetime.now() - timedelta(days=180)
    await db.execute(delete(ImportSession).where(ImportSession.created_at < cutoff))

    result = await db.execute(
        select(ImportSession).order_by(ImportSession.created_at.desc())
    )
    sessions = result.scalars().all()

    return [ImportSessionOut.from_orm_model(s).model_dump() for s in sessions]


@router.delete("/import-sessions/{session_id}")
async def delete_import_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    # Count and delete transactions for this session
    result = await db.execute(
        select(Transaction).where(Transaction.import_id == session_id)
    )
    session_txns = result.scalars().all()
    removed = len(session_txns)

    await db.execute(delete(Transaction).where(Transaction.import_id == session_id))

    # Delete the session itself
    await db.execute(delete(ImportSession).where(ImportSession.id == session_id))

    # Re-run transfer detection on remaining transactions
    await db.flush()
    await run_detection(db, strip_existing=True)

    return {"success": True, "removed": removed}
