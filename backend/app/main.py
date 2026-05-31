from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routes.auth import router as auth_router
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
from app.routes.invitations import router as invitations_router
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
    if not settings.finance_manager_demo_mode and not settings.jwt_signing_secret:
        raise RuntimeError(
            "JWT_SIGNING_SECRET is not set. Refusing to serve without auth."
        )
    yield


app = FastAPI(title="Finance Manager API", lifespan=lifespan)

_cors_origins = [
    o.strip() for o in settings.cors_allowed_origins.split(",") if o.strip()
]
if _cors_origins:
    # Credentialed CORS for cross-origin dev setups (see config.py).
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    # Default: wildcard, no credentials. Prod is same-origin so this is inert;
    # preserved for backwards-compat with any pre-Phase-4 external API client.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )


app.include_router(auth_router)
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
app.include_router(invitations_router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
