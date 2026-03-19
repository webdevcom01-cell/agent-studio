"""
ECC Skills MCP Server

Exposes ECC skills from the PostgreSQL Skill table via MCP protocol.
Three tools: get_skill, search_skills, list_skills.

Transport: Streamable HTTP on port 8000.
Deploy: Railway private networking only (*.railway.internal).
Health endpoint: GET /health (Starlette, independent of MCP).
"""

import os
import json
import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

import asyncpg
import uvicorn
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route, Mount
from mcp.server.fastmcp import FastMCP

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("ecc-skills-mcp")

DATABASE_URL = os.environ.get("DATABASE_URL", "")
PORT = int(os.environ.get("PORT", "8000"))
MAX_RESULTS = 50

pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global pool
    if pool is None:
        if not DATABASE_URL:
            raise RuntimeError("DATABASE_URL environment variable is required")
        pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
        logger.info("Database connection pool created")
    return pool


# --- Starlette health endpoint (independent of MCP) ---

async def health_check(request):
    """Health check endpoint for Railway."""
    try:
        db = await get_pool()
        await db.fetchval("SELECT 1")
        return JSONResponse({"status": "healthy", "service": "ecc-skills-mcp"})
    except Exception as e:
        return JSONResponse({"status": "unhealthy", "error": str(e)}, status_code=503)


# --- MCP Server setup ---

@asynccontextmanager
async def lifespan(server: FastMCP) -> AsyncIterator[dict]:
    """Initialize DB pool on startup, close on shutdown."""
    db_pool = await get_pool()
    logger.info("ECC Skills MCP server starting on port %d", PORT)
    yield {"pool": db_pool}
    if pool is not None:
        await pool.close()
        logger.info("Database connection pool closed")


mcp = FastMCP(
    "ECC Skills",
    description="Search and retrieve ECC development skills for AI agents",
    lifespan=lifespan,
)


@mcp.tool()
async def get_skill(name: str) -> str:
    """Get a specific skill by slug or name.

    Args:
        name: The skill slug (e.g. 'api-design') or display name.
    """
    db = await get_pool()

    row = await db.fetchrow(
        'SELECT slug, name, version, description, content, tags, category, language '
        'FROM "Skill" WHERE slug = $1 OR LOWER(name) = LOWER($1) LIMIT 1',
        name,
    )
    if not row:
        return json.dumps({"error": f"Skill '{name}' not found"})
    return json.dumps({
        "slug": row["slug"], "name": row["name"], "version": row["version"],
        "description": row["description"], "content": row["content"],
        "tags": row["tags"] or [], "category": row["category"], "language": row["language"],
    }, ensure_ascii=False)


@mcp.tool()
async def search_skills(query: str, tag: str = "", language: str = "") -> str:
    """Search skills by keyword with optional tag and language filters.

    Args:
        query: Search term matched against name, description, and content.
        tag: Optional tag filter. language: Optional language filter.
    """
    db = await get_pool()
    conditions = ["(LOWER(name) LIKE $1 OR LOWER(description) LIKE $1 OR LOWER(content) LIKE $1)"]
    params: list = [f"%{query.lower()}%"]
    param_idx = 2

    if tag:
        conditions.append(f"${param_idx} = ANY(tags)")
        params.append(tag.lower())
        param_idx += 1
    if language:
        conditions.append(f"LOWER(language) = LOWER(${param_idx})")
        params.append(language)
        param_idx += 1

    where_clause = " AND ".join(conditions)
    rows = await db.fetch(
        f'SELECT slug, name, description, tags, category, language '
        f'FROM "Skill" WHERE {where_clause} ORDER BY name ASC LIMIT {MAX_RESULTS}',
        *params,
    )
    return json.dumps([{
        "slug": r["slug"], "name": r["name"], "description": r["description"],
        "tags": r["tags"] or [], "category": r["category"], "language": r["language"],
    } for r in rows], ensure_ascii=False)


@mcp.tool()
async def list_skills(language: str = "", category: str = "") -> str:
    """List all available skills with optional filters.

    Args:
        language: Optional language filter. category: Optional category filter.
    """
    db = await get_pool()

    conditions: list[str] = []
    params: list = []
    param_idx = 1
    if language:
        conditions.append(f"LOWER(language) = LOWER(${param_idx})")
        params.append(language)
        param_idx += 1
    if category:
        conditions.append(f"LOWER(category) = LOWER(${param_idx})")
        params.append(category)
        param_idx += 1

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    rows = await db.fetch(
        f'SELECT slug, name, description, tags, category, language '
        f'FROM "Skill" {where_clause} ORDER BY name ASC LIMIT {MAX_RESULTS}',
        *params,
    )
    return json.dumps([{
        "slug": r["slug"], "name": r["name"], "description": r["description"],
        "tags": r["tags"] or [], "category": r["category"], "language": r["language"],
    } for r in rows], ensure_ascii=False)


# --- ASGI app: Starlette wraps MCP + health ---

def create_app() -> Starlette:
    """Create Starlette ASGI app with health endpoint + MCP mounted."""
    mcp_app = mcp.streamable_http_app()

    return Starlette(
        routes=[
            Route("/health", health_check, methods=["GET"]),
            Mount("/", app=mcp_app),
        ],
    )


if __name__ == "__main__":
    app = create_app()
    logger.info("Starting ECC Skills MCP server on 0.0.0.0:%d", PORT)
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")
