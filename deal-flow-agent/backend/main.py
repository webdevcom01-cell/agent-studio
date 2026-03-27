"""
Deal Flow Agent — FastAPI entry point.
Run: python backend/main.py
"""
from __future__ import annotations
import logging
import time
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.config import settings

# ── Logging ────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)

_start_time = time.time()


# ── Lifespan ───────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup / shutdown hooks."""
    logger.info("=" * 60)
    logger.info("Deal Flow Agent starting up")
    logger.info("AI model  : %s", settings.AI_MODEL)

    # Optional: initialise DB (graceful — never blocks startup)
    try:
        from backend.database.connection import init_db, check_db_connection
        ok = await check_db_connection()
        if ok:
            await init_db()
            logger.info("Database  : connected ✓")
        else:
            logger.warning("Database  : not available — running in memory-only mode")
    except Exception as exc:
        logger.warning("Database  : skipped (%s)", exc)

    logger.info("=" * 60)
    yield
    logger.info("Deal Flow Agent shutting down")


# ── App ────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Deal Flow Agent",
    description=(
        "AI-powered M&A due-diligence platform. "
        "5 specialised agents (Screening, Financial, Risk, Competitive, Legal) "
        "analyse deals and generate Investment Memoranda."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ─────────────────────────────────────────────────────────────────

@app.get("/health", tags=["system"])
async def health() -> dict[str, Any]:
    """Health check — always returns 200."""
    from backend.config import settings as cfg

    db_status = "not_checked"
    try:
        from backend.database.connection import check_db_connection
        db_status = "connected" if await check_db_connection() else "unavailable"
    except Exception:
        db_status = "unavailable"

    return {
        "status": "healthy",
        "version": "1.0.0",
        "uptime_seconds": round(time.time() - _start_time, 1),
        "database": db_status,
        "ai_model": cfg.AI_MODEL,
        "agents": ["screening", "financial", "risk", "competitive", "legal"],
        "mode": "demo" if not cfg.ANTHROPIC_API_KEY and not cfg.OPENAI_API_KEY else "live",
    }


@app.get("/", tags=["system"])
async def root() -> dict[str, str]:
    return {
        "name": "Deal Flow Agent",
        "docs": "/docs",
        "health": "/health",
        "version": "1.0.0",
    }


# ── Routers ────────────────────────────────────────────────────────────────

from backend.routers import deals, agents, memos  # noqa: E402

app.include_router(deals.router)
app.include_router(agents.router)
app.include_router(memos.router)


# ── Error handlers ─────────────────────────────────────────────────────────

@app.exception_handler(Exception)
async def generic_exception_handler(request: Any, exc: Exception) -> JSONResponse:
    logger.error("Unhandled exception: %s", exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "type": type(exc).__name__},
    )


# ── Entry point ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        log_level="info",
    )
