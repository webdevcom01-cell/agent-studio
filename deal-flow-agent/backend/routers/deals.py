"""
Deal CRUD router.
POST /deals      — create a new deal
GET  /deals      — list deals (most recent first)
GET  /deals/{id} — single deal detail
DELETE /deals/{id} — delete deal
"""
from __future__ import annotations
import logging
from typing import Any, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/deals", tags=["deals"])

# ── In-memory store (used when DB unavailable) ─────────────────────────────
_deals: dict[str, dict[str, Any]] = {}
_deal_counter = 0


# ── Pydantic schemas ───────────────────────────────────────────────────────

class DealCreate(BaseModel):
    deal_name: str = Field(..., description="Descriptive name for the deal, e.g. 'SalesHero Series B'")
    company_name: str
    industry: str = "Technology"
    country: str = "United Kingdom"
    deal_type: str = "acquisition"
    deal_value_usd: float = Field(..., gt=0, description="Enterprise value in USD")
    revenue_usd: float = Field(..., gt=0)
    ebitda_usd: float
    irr_target: float = Field(20.0, ge=0, le=100)
    description: Optional[str] = None
    employee_count: Optional[int] = None
    competitors: Optional[str] = None
    notes: Optional[str] = None


class DealResponse(BaseModel):
    id: str
    deal_name: str
    company_name: str
    industry: str
    country: str
    deal_type: str
    deal_value_usd: float
    revenue_usd: float
    ebitda_usd: float
    ev_ebitda: float
    irr_target: float
    description: Optional[str]
    employee_count: Optional[int]
    status: str
    overall_score: Optional[float]
    recommendation: Optional[str]
    created_at: str


# ── Routes ─────────────────────────────────────────────────────────────────

@router.post("", response_model=DealResponse, status_code=201)
async def create_deal(body: DealCreate) -> DealResponse:
    """Create a new M&A deal for analysis."""
    global _deal_counter
    _deal_counter += 1
    deal_id = f"deal_{_deal_counter:04d}"

    from datetime import datetime, timezone
    ev_ebitda = body.deal_value_usd / max(body.ebitda_usd, 1)

    deal: dict[str, Any] = {
        "id": deal_id,
        "deal_name": body.deal_name,
        "company_name": body.company_name,
        "industry": body.industry,
        "country": body.country,
        "deal_type": body.deal_type,
        "deal_value_usd": body.deal_value_usd,
        "revenue_usd": body.revenue_usd,
        "ebitda_usd": body.ebitda_usd,
        "ev_ebitda": round(ev_ebitda, 2),
        "irr_target": body.irr_target,
        "description": body.description or f"M&A target: {body.company_name}",
        "employee_count": body.employee_count,
        "competitors": body.competitors,
        "notes": body.notes,
        "status": "PENDING",
        "overall_score": None,
        "recommendation": None,
        "agent_results": {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _deals[deal_id] = deal
    logger.info("[Deals] Created deal %s — %s", deal_id, body.deal_name)

    # Attempt DB persist (graceful fallback)
    try:
        from backend.database.connection import get_db
        from backend.database import models
        async for db in get_db():
            db_deal = models.Deal(
                id=deal_id,
                deal_name=deal["deal_name"],
                company_name=deal["company_name"],
                industry=deal["industry"],
                country=deal["country"],
                deal_type=deal["deal_type"],
                deal_value_usd=deal["deal_value_usd"],
                revenue_usd=deal["revenue_usd"],
                ebitda_usd=deal["ebitda_usd"],
                ev_ebitda=deal["ev_ebitda"],
                irr_target=deal["irr_target"],
                description=deal["description"],
                employee_count=deal["employee_count"],
            )
            db.add(db_deal)
            await db.commit()
    except Exception as exc:
        logger.debug("[Deals] DB persist skipped: %s", exc)

    return DealResponse(**{k: v for k, v in deal.items() if k != "agent_results" and k != "competitors" and k != "notes"})


@router.get("", response_model=list[DealResponse])
async def list_deals() -> list[DealResponse]:
    """List all deals, most recent first."""
    deals = sorted(_deals.values(), key=lambda d: d["created_at"], reverse=True)
    return [
        DealResponse(**{k: v for k, v in d.items() if k not in ("agent_results", "competitors", "notes")})
        for d in deals
    ]


@router.get("/{deal_id}")
async def get_deal(deal_id: str) -> dict[str, Any]:
    """Get full deal detail including agent results."""
    deal = _deals.get(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail=f"Deal {deal_id!r} not found")
    return deal


@router.delete("/{deal_id}", status_code=204)
async def delete_deal(deal_id: str) -> None:
    """Delete a deal."""
    if deal_id not in _deals:
        raise HTTPException(status_code=404, detail=f"Deal {deal_id!r} not found")
    del _deals[deal_id]
    logger.info("[Deals] Deleted deal %s", deal_id)
