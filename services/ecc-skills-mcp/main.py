"""
ECC Skills MCP Server

Exposes ECC skills from the PostgreSQL Skill table via MCP protocol.
Three tools: get_skill, search_skills, list_skills.

Transport: Streamable HTTP on port 8000.
Deploy: Railway private networking only (*.railway.internal).
"""

import os
import json
import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

import asyncpg
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

    Returns:
        Full skill content with metadata, or error message if not found.
    """
    db = await get_pool()

    row = await db.fetchrow(
        """
        SELECT slug, name, version, description, content, tags, category, language
        FROM "Skill"
        WHERE slug = $1 OR LOWER(name) = LOWER($1)
        LIMIT 1
        """,
        name,
    )

    if not row:
        return json.dumps({"error": f"Skill '{name}' not found"})

    return json.dumps(
        {
            "slug": row["slug"],
            "name": row["name"],
            "version": row["version"],
            "description": row["description"],
            "content": row["content"],
            "tags": row["tags"] or [],
            "category": row["category"],
            "language": row["language"],
        },
        ensure_ascii=False,
    )


@mcp.tool()
async def search_skills(query: str, tag: str = "", language: str = "") -> str:
    """Search skills by keyword with optional tag and language filters.

    Args:
        query: Search term matched against name, description, and content.
        tag: Optional tag to filter by (e.g. 'typescript', 'security').
        language: Optional programming language filter (e.g. 'python', 'go').

    Returns:
        JSON array of matching skills (slug, name, description, tags, category, language).
    """
    db = await get_pool()

    conditions = ["(LOWER(name) LIKE $1 OR LOWER(description) LIKE $1 OR LOWER(content) LIKE $1)"]
    params: list = [f"%{query.lower()}%"]
    param_idx = 2

    if tag:
        conditions.append(f"$${param_idx} = ANY(tags)")
        params.append(tag.lower())
        param_idx += 1

    if language:
        conditions.append(f"LOWER(language) = LOWER($${param_idx})")
        params.append(language)
        param_idx += 1

    where_clause = " AND ".join(conditions)

    rows = await db.fetch(
        f"""
        SELECT slug, name, description, tags, category, language
        FROM "Skill"
        WHERE {where_clause}
        ORDER BY name ASC
        LIMIT {MAX_RESULTS}
        """,
        *params,
    )

    results = [
        {
            "slug": r["slug"],
            "name": r["name"],
            "description": r["description"],
            "tags": r["tags"] or [],
            "category": r["category"],
            "language": r["language"],
        }
        for r in rows
    ]

    return json.dumps(results, ensure_ascii=False)


@mcp.tool()
async def list_skills(language: str = "", category: str = "") -> str:
    """List all available skills with optional filters.

    Args:
        language: Optional filter by programming language.
        category: Optional filter by category.

    Returns:
        JSON array of skills (slug, name, description, tags, category, language).
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
        f"""
        SELECT slug, name, description, tags, category, language
        FROM "Skill"
        {where_clause}
        ORDER BY name ASC
        LIMIT {MAX_RESULTS}
        """,
        *params,
    )

    results = [
        {
            "slug": r["slug"],
            "name": r["name"],
            "description": r["description"],
            "tags": r["tags"] or [],
            "category": r["category"],
            "language": r["language"],
        }
        for r in rows
    ]

    return json.dumps(results, ensure_ascii=False)


@mcp.custom_route("/health", methods=["GET"])
async def health_check(request):
    """Health check endpoint for Railway."""
    from starlette.responses import JSONResponse

    try:
        db = await get_pool()
        await db.fetchval("SELECT 1")
        return JSONResponse({"status": "healthy", "service": "ecc-skills-mcp"})
    except Exception as e:
        return JSONResponse(
            {"status": "unhealthy", "error": str(e)},
            status_code=503,
        )


if __name__ == "__main__":
    mcp.run(transport="streamable-http", host="0.0.0.0", port=PORT)
