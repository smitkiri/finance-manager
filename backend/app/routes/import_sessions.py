from datetime import datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_household_id
from app.models.import_session import ImportSession
from app.models.transaction import Transaction
from app.schemas.import_session import ImportSessionOut
from app.utils.subscription_utils import run_detection_bg
from app.utils.transfer_utils import run_detection

router = APIRouter(prefix="/api", tags=["import_sessions"])


@router.get("/import-sessions")
async def get_import_sessions(
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    # Auto-delete sessions older than 6 months (within this household)
    cutoff = datetime.now() - timedelta(days=180)
    await db.execute(
        delete(ImportSession).where(
            ImportSession.household_id == household_id,
            ImportSession.created_at < cutoff,
        )
    )

    result = await db.execute(
        select(ImportSession)
        .where(ImportSession.household_id == household_id)
        .order_by(ImportSession.created_at.desc())
    )
    sessions = result.scalars().all()

    return [ImportSessionOut.from_orm_model(s).model_dump() for s in sessions]


@router.delete("/import-sessions/{session_id}")
async def delete_import_session(
    session_id: str,
    bg: BackgroundTasks,
    household_id: str = Depends(get_current_household_id),
    db: AsyncSession = Depends(get_db),
):
    # Confirm the session belongs to this household
    own_result = await db.execute(
        select(ImportSession.id).where(
            ImportSession.id == session_id,
            ImportSession.household_id == household_id,
        )
    )
    if own_result.first() is None:
        return {"success": True, "removed": 0}

    # Count and delete transactions for this session within the household
    result = await db.execute(
        select(Transaction).where(
            Transaction.import_id == session_id,
            Transaction.household_id == household_id,
        )
    )
    session_txns = result.scalars().all()
    removed = len(session_txns)

    await db.execute(
        delete(Transaction).where(
            Transaction.import_id == session_id,
            Transaction.household_id == household_id,
        )
    )

    # Delete the session itself
    await db.execute(
        delete(ImportSession).where(
            ImportSession.id == session_id,
            ImportSession.household_id == household_id,
        )
    )

    # Re-run transfer detection on remaining transactions in this household
    await db.flush()
    await run_detection(db, strip_existing=True, household_id=household_id)
    bg.add_task(run_detection_bg, household_id)

    return {"success": True, "removed": removed}
