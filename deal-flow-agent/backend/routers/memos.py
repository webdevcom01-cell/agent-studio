"""
Investment Memo router.
POST /memos/generate/{deal_id} — generate full Investment Memorandum
GET  /memos/{deal_id}          — retrieve generated memo
GET  /memos/{deal_id}/markdown — raw Markdown
"""
from __future__ import annotations
import logging
from typing import Any
from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse

from backend.memo.generator import MemoGenerator
from backend.routers.deals import _deals

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/memos", tags=["memos"])

# In-memory memo cache
_memos: dict[str, dict[str, Any]] = {}

_generator = MemoGenerator()


@router.post("/generate/{deal_id}")
async def generate_memo(deal_id: str) -> dict[str, Any]:
    """
    Generate a full Investment Memorandum for a deal.
    Requires agents to have run first (status == ANALYSED).
    """
    deal = _deals.get(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail=f"Deal {deal_id!r} not found")

    agent_results = deal.get("agent_results", {})
    if not agent_results:
        raise HTTPException(
            status_code=422,
            detail="No agent results found. Run /agents/run/{deal_id} first.",
        )

    logger.info("[Memo] Generating memo for deal %s", deal_id)

    memo = _generator.generate(deal, agent_results)
    memo["deal_id"] = deal_id
    _memos[deal_id] = memo

    # Update deal status
    deal["status"] = "MEMO_READY"
    deal["recommendation"] = memo["recommendation"]
    deal["overall_score"] = memo["overall_score"]

    logger.info(
        "[Memo] Generated memo for %s. Score=%.1f, Rec=%s",
        deal_id, memo["overall_score"], memo["recommendation"]
    )

    # Return without full body (can be large)
    return {
        "deal_id": deal_id,
        "title": memo["title"],
        "overall_score": memo["overall_score"],
        "recommendation": memo["recommendation"],
        "executive_summary": memo["executive_summary"],
        "memo_length_chars": len(memo.get("markdown_body", "")),
        "status": "MEMO_READY",
    }


@router.get("/{deal_id}")
async def get_memo(deal_id: str) -> dict[str, Any]:
    """Return the full generated memo (includes html_body and markdown_body)."""
    memo = _memos.get(deal_id)
    if not memo:
        raise HTTPException(
            status_code=404,
            detail=f"No memo for deal {deal_id!r}. Generate it via POST /memos/generate/{deal_id}"
        )
    return memo


@router.get("/{deal_id}/markdown", response_class=PlainTextResponse)
async def get_memo_markdown(deal_id: str) -> str:
    """Return raw Markdown of the memo."""
    memo = _memos.get(deal_id)
    if not memo:
        raise HTTPException(status_code=404, detail=f"No memo for deal {deal_id!r}")
    return memo.get("markdown_body", "")
