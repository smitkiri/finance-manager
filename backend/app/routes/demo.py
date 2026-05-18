from fastapi import APIRouter

from app.config import settings

router = APIRouter(prefix="/api/demo", tags=["demo"])


@router.get("/config")
async def demo_config():
    return {"enabled": settings.finance_manager_demo_mode}
