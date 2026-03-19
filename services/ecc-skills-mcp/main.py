"""
ECC Skills MCP Server
Exposes ECC skills from PostgreSQL via MCP protocol.
Health: GET /health (plain text, no dependencies)
MCP: mounted at /mcp (Streamable HTTP)
"""

import os, json, logging
import asyncpg
import uvicorn
from starlette.applications import Starlette
from starlette.responses import PlainTextResponse
from starlette.routing import Route, Mount
from starlette.middleware.base import BaseHTTPMiddleware
from mcp.server.fastmcp import FastMCP

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ecc-skills-mcp")

DATABASE_URL = os.environ.get("DATABASE_URL", "")
PORT = int(os.environ.get("PORT", "8000"))
pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global pool
    if pool is None:
        pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    return pool


# MCP Server — only name, no extra kwargs
mcp = FastMCP("ECC Skills")


@mcp.tool()
async def get_skill(name: str) -> str:
    """Get a skill by slug or name."""
    db = await get_pool()
    row = await db.fetchrow(
        'SELECT slug, name, version, description, content, tags, category, language '
        'FROM "Skill" WHERE slug = $1 OR LOWER(name) = LOWER($1) LIMIT 1', name)
    if not row:
        return json.dumps({"error": f"Skill '{name}' not found"})
    return json.dumps(dict(row), default=str, ensure_ascii=False)


@mcp.tool()
async def search_skills(query: str, tag: str = "", language: str = "") -> str:
    """Search skills by keyword."""
    db = await get_pool()
    conds = ["(LOWER(name) LIKE $1 OR LOWER(description) LIKE $1)"]
    params = [f"%{query.lower()}%"]
    i = 2
    if tag:
        conds.append(f"${i} = ANY(tags)"); params.append(tag.lower()); i += 1
    if language:
        conds.append(f"LOWER(language) = LOWER(${i})"); params.append(language)
    rows = await db.fetch(
        f'SELECT slug, name, description, tags, category, language FROM "Skill" '
        f'WHERE {" AND ".join(conds)} ORDER BY name LIMIT 50', *params)
    return json.dumps([dict(r) for r in rows], default=str, ensure_ascii=False)


@mcp.tool()
async def list_skills(language: str = "", category: str = "") -> str:
    """List skills with optional filters."""
    db = await get_pool()
    conds, params, i = [], [], 1
    if language:
        conds.append(f"LOWER(language) = LOWER(${i})"); params.append(language); i += 1
    if category:
        conds.append(f"LOWER(category) = LOWER(${i})"); params.append(category)
    where = f"WHERE {' AND '.join(conds)}" if conds else ""
    rows = await db.fetch(
        f'SELECT slug, name, description, tags, category, language FROM "Skill" '
        f'{where} ORDER BY name LIMIT 50', *params)
    return json.dumps([dict(r) for r in rows], default=str, ensure_ascii=False)


# ASGI middleware: handles /health + rewrites Host header for FastMCP validation
class RailwayMiddleware:
    """
    Sits in front of FastMCP ASGI app.
    1. Intercepts GET /health → returns plain "ok" (no DB needed)
    2. Rewrites Host header to 'localhost' so FastMCP host-validation passes
       regardless of Railway's public domain name.
    """
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            path = scope.get("path", "")
            if path == "/health":
                await send({
                    "type": "http.response.start",
                    "status": 200,
                    "headers": [(b"content-type", b"text/plain; charset=utf-8")],
                })
                await send({"type": "http.response.body", "body": b"ok", "more_body": False})
                return
            # Rewrite Host → localhost so FastMCP accepts the request
            headers = [
                (b"host", b"localhost") if k.lower() == b"host" else (k, v)
                for k, v in scope.get("headers", [])
            ]
            scope = {**scope, "headers": headers}
        await self.app(scope, receive, send)

# FastMCP at root + Railway-aware middleware
app = RailwayMiddleware(mcp.streamable_http_app())

if __name__ == "__main__":
    logger.info("Starting on 0.0.0.0:%d", PORT)
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, log_level="info")
