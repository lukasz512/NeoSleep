"""
Neo CRM — FastAPI entry point.

Start:
    uvicorn main:app --reload --port 8000

Production:
    uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from config import get_settings
from database import close_pool, create_pool
from routers.auth import router as auth_router, limiter
from routers.practitioner import router as practitioner_router
from routers.lookup import router as lookup_router
from routers.encounter import router as encounter_router
from routers.diagnostics import router as diagnostics_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s  %(message)s",
)
logger = logging.getLogger("neocrm")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────────────────────────
    settings = get_settings()
    logger.info("Starting Neo CRM API  env=%s", settings.env)
    await create_pool()
    logger.info("Ready")
    yield
    # ── Shutdown ─────────────────────────────────────────────────────────────
    await close_pool()
    logger.info("Shutdown complete")


settings = get_settings()

app = FastAPI(
    title="Neo CRM API",
    version="2.0.0",
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
    lifespan=lifespan,
)

# ── Rate limiting ─────────────────────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# ── CORS ──────────────────────────────────────────────────────────────────────
# Allow credentials so the httpOnly refresh_token cookie is sent cross-origin in dev.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Global exception handler ──────────────────────────────────────────────────
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception: %s", exc, exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"error": "Internal server error"},
    )

# ── Routers ───────────────────────────────────────────────────────────────────
PREFIX = "/api/v1"

app.include_router(auth_router,          prefix=PREFIX)
app.include_router(practitioner_router,  prefix=PREFIX)
app.include_router(lookup_router,        prefix=PREFIX)
app.include_router(encounter_router,     prefix=PREFIX)
app.include_router(diagnostics_router,   prefix=PREFIX)


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "2.0.0"}
