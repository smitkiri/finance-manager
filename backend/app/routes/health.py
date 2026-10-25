from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
async def health(db: AsyncSession = Depends(get_db)):
    # Used by the prod Docker healthcheck: the backend is only useful if it
    # can reach Postgres, so a failed round-trip reports 503.
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        return JSONResponse(
            status_code=503, content={"status": "error", "database": "unreachable"}
        )
    return {"status": "ok", "database": "ok"}
