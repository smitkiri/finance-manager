from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.routes.categories import router as categories_router
from app.routes.date_range import router as date_range_router
from app.routes.expenses import router as expenses_router
from app.routes.sources import router as sources_router
from app.routes.users import router as users_router

app = FastAPI(title="Finance Manager API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def api_key_auth(request: Request, call_next):
    if settings.api_secret and request.url.path.startswith("/api"):
        api_key = request.headers.get("x-api-key")
        if api_key != settings.api_secret:
            return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    return await call_next(request)


app.include_router(categories_router)
app.include_router(date_range_router)
app.include_router(expenses_router)
app.include_router(sources_router)
app.include_router(users_router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
