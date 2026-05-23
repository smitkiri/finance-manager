from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.routes.backup import router as backup_router
from app.routes.categories import router as categories_router
from app.routes.dashboards import router as dashboards_router
from app.routes.data import router as data_router
from app.routes.date_range import router as date_range_router
from app.routes.demo import router as demo_router
from app.routes.expenses import router as expenses_router
from app.routes.households import router as households_router
from app.routes.import_sessions import router as import_sessions_router
from app.routes.imports import router as imports_router
from app.routes.net_worth import router as net_worth_router
from app.routes.reports import router as reports_router
from app.routes.sources import router as sources_router
from app.routes.teller import check_credentials_at_startup as _check_teller_credentials
from app.routes.teller import router as teller_router
from app.routes.transfers import router as transfers_router
from app.routes.users import router as users_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    _check_teller_credentials()
    yield


app = FastAPI(title="Finance Manager API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def api_key_auth(request: Request, call_next):
    if (
        settings.api_secret
        and request.url.path.startswith("/api")
        and request.method != "OPTIONS"
    ):
        api_key = request.headers.get("x-api-key")
        if api_key != settings.api_secret:
            return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    return await call_next(request)


app.include_router(households_router)
app.include_router(categories_router)
app.include_router(net_worth_router)
app.include_router(date_range_router)
app.include_router(expenses_router)
app.include_router(reports_router)
app.include_router(sources_router)
app.include_router(imports_router)
app.include_router(import_sessions_router)
app.include_router(data_router)
app.include_router(demo_router)
app.include_router(backup_router)
app.include_router(transfers_router)
app.include_router(users_router)
app.include_router(dashboards_router)
app.include_router(teller_router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
