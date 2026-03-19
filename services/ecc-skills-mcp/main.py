"""
ECC Skills MCP Server

Exposes ECC skills from the PostgreSQL Skill table via MCP protocol.
Three tools: get_skill, search_skills, list_skills.

Transport: Streamable HTTP mounted at /mcp
Health: GET /health (plain "ok" - no DB dependency for fast Railway healthcheck)
Deploy: Railway private networking only.
"""

import os
import json
import logging
import contextlib

import asyncpg
import uvicorn
from starlette.applications import Starlette
from starlette.responses import JSONResponse, PlainTextResponse
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
            raise RuntimeError("DATABASE_URL is required")
        pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
        logger.info("DB pool created")
    return pool


# --- Health: plain text, zero dependencies, instant response ---
async def health_check(request):
    return PlainTextResponse("ok")


# --- MCP Server ---
mcp = FastMCP(
    "ECC Skills",
    description="Search and retrieve ECC development skills for AI agents",
    stateless_http=True,
    json_response=True,
)


@mcp.tool()
async def get_skill(name: str) -> str:
    """Get a specific skill by slug or name."""
    db = await get_pool()
    row = await db.fetchrow(
        'SELECT slug, name, version, description, content, tags, category, language '
        'FROM "Skill" WHERE slug = $1 OR LOWER(name) = LOWER($1) LIMIT 1', name)
    if not row:
        return json.dumps({"error": f"Skill '{name}' not found"})
    return json.dumps({k: (row[k] or [] if k == "tags" else row[k]) for k in
        ["slug", "name", "version", "description", "content", "tags", "category", "language"]},
        ensure_ascii=False)


@mcp.tool()
async def search_skills(query: str, tag: str = "", language: str = "") -> str:
    """Search skills by keyword with optional tag and language filters."""
    db = await get_pool()
    conditions = ["(LOWER(name) LIKE $1 OR LOWER(description) LIKE $1 OR LOWER(content) LIKE $1)"]
    params = [f"%{query.lower()}%"]
    idx = 2
    if tag:
        conditions.append(f"${idx} = ANY(tags)"); params.append(tag.lower()); idx += 1
    if language:
        conditions.append(f"LOWER(language) = LOWER(${idx})"); params.append(language); idx += 1
    rows = await db.fetch(
        f'SELECT slug, name, description, tags, category, language FROM "Skill" '
        f'WHERE {" AND ".join(conditions)} ORDER BY name LIMIT {MAX_RESULTS}', *params)
    return json.dumps([{k: (r[k] or [] if k == "tags" else r[k]) for k in
        ["slug", "name", "description", "tags", "category", "language"]} for r in rows],
        ensure_ascii=False)


@mcp.tool()
async def list_skills(language: str = "", category: str = "") -> str:
    """List all available skills with optional filters."""
    db = await get_pool()
    conditions, params, idx = [], [], 1
    if language:
        conditions.append(f"LOWER(language) = LOWER(${idx})"); params.append(language); idx += 1
    if category:
        conditions.append(f"LOWER(category) = LOWER(${idx})"); params.append(category); idx += 1
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    rows = await db.fetch(
        f'SELECT slug, name, description, tags, category, language FROM "Skill" '
        f'{where} ORDER BY name LIMIT {MAX_RESULTS}', *params)
    return json.dumps([{k: (r[k] or [] if k == "tags" else r[k]) for k in
        ["slug", "name", "description", "tags", "category", "language"]} for r in rows],
        ensure_ascii=False)


# --- ASGI App: Starlette with proper MCP lifespan ---
@contextlib.asynccontextmanager
async def lifespan(app):
    """Start MCP session manager + DB pool."""
    async with mcp.session_manager.run():
        logger.info("MCP session manager started")
        yield
    if pool is not None:
        await pool.close()
        logger.info("DB pool closed")


app = Starlette(
    routes=[
        Route("/health", health_check, methods=["GET"]),
        Mount("/mcp", app=mcp.streamable_http_app()),
    ],
    lifespan=lifespan,
)


if __name__ == "__main__":
    logger.info("Starting ECC Skills MCP on 0.0.0.0:%d", PORT)
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")
