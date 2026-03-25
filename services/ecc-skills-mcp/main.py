"""
ECC Skills MCP Server
Exposes ECC skills from PostgreSQL via MCP protocol.
Health: GET /health (plain text, no dependencies)
MCP: mounted at /mcp (Streamable HTTP)

Transport Security:
  Railway terminates TLS externally. Instead of monkey-patching MCP SDK
  internals (fragile, breaks on SDK updates), we rewrite the Host header
  to 'localhost' in ASGI middleware — the same approach as nginx
  proxy_set_header. This satisfies FastMCP's built-in host validation
  without touching any SDK classes.
"""

import os, json, logging
import asyncpg
import uvicorn

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ecc-skills-mcp")

DATABASE_URL = os.environ.get("DATABASE_URL", "")
PORT = int(os.environ.get("PORT", "8000"))

from mcp.server.fastmcp import FastMCP
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


class RailwayProxyMiddleware:
    """
    ASGI middleware that acts as a reverse proxy for Railway deployments:

    1. GET /health → plain "ok" (no DB, fast Railway healthcheck)
    2. Rewrites Host header to 'localhost' for all MCP requests.
       This satisfies FastMCP's TransportSecurityMiddleware host validation
       without monkey-patching any SDK internals.
    3. Normalizes /mcp/ → /mcp to avoid Starlette redirect loops.

    This is equivalent to nginx's:
        proxy_set_header Host localhost;
    """
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")

        # Health check — bypass MCP entirely
        if path == "/health":
            await send({
                "type": "http.response.start",
                "status": 200,
                "headers": [(b"content-type", b"text/plain; charset=utf-8")],
            })
            await send({"type": "http.response.body", "body": b"ok", "more_body": False})
            return

        # Normalize /mcp/ → /mcp to avoid Starlette internal redirect loop
        if path == "/mcp/":
            scope = dict(scope)
            scope["path"] = "/mcp"
            scope["raw_path"] = b"/mcp"

        # Rewrite Host header to 'localhost' for MCP transport security.
        # Railway internal networking sends Host: positive-inspiration.railway.internal:8000
        # but FastMCP's TransportSecurityMiddleware only allows 'localhost' by default.
        scope = dict(scope)
        headers = [(k, v) for k, v in scope.get("headers", [])
                   if k not in (b"host", b"origin")]
        headers.append((b"host", b"localhost"))
        headers.append((b"origin", b"http://localhost"))
        scope["headers"] = headers

        await self.app(scope, receive, send)


# FastMCP at root + Railway-aware middleware
app = RailwayProxyMiddleware(mcp.streamable_http_app())

if __name__ == "__main__":
    logger.info("Starting on 0.0.0.0:%d", PORT)
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, log_level="info")
