"""
Agent execution router.
POST /agents/run/{deal_id}        — run all 5 agents in parallel
POST /agents/run/{deal_id}/{name} — run a single named agent
GET  /agents/results/{deal_id}    — get agent results for a deal
"""
from __future__ import annotations
import asyncio
import logging
from typing import Any
from fastapi import APIRouter, HTTPException

from backend.agents.screening_agent import ScreeningAgent
from backend.agents.financial_agent import FinancialAgent
from backend.agents.risk_agent import RiskAgent
from backend.agents.competitive_agent import CompetitiveAgent
from backend.agents.legal_agent import LegalAgent
from backend.routers.deals import _deals

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agents", tags=["agents"])

AGENT_REGISTRY: dict[str, type] = {
    "screening":   ScreeningAgent,
    "financial":   FinancialAgent,
    "risk":        RiskAgent,
    "competitive": CompetitiveAgent,
    "legal":       LegalAgent,
}


async def _run_agent(name: str, deal_data: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    """Instantiate and run a single agent; return (name, result_dict)."""
    cls = AGENT_REGISTRY[name]
    agent = cls()
    result = await agent.run(deal_data)
    return name, result.to_dict()


@router.post("/run/{deal_id}")
async def run_all_agents(deal_id: str) -> dict[str, Any]:
    """
    Run all 5 due-diligence agents concurrently for a deal.
    Updates the deal status and stores results.
    """
    deal = _deals.get(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail=f"Deal {deal_id!r} not found")

    deal["status"] = "ANALYSING"
    logger.info("[Agents] Starting parallel run for deal %s", deal_id)

    # Run all 5 agents concurrently
    tasks = [_run_agent(name, deal) for name in AGENT_REGISTRY]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    agent_results: dict[str, dict[str, Any]] = {}
    for item in results:
        if isinstance(item, Exception):
            logger.warning("[Agents] Agent failed: %s", item)
            continue
        name, result_dict = item
        agent_results[name] = result_dict.get("analysis", {})
        # Embed score directly for quick access
        agent_results[name]["score"] = result_dict.get("score", 50)
        agent_results[name]["summary"] = agent_results[name].get("summary", "")

    deal["agent_results"] = agent_results
    deal["status"] = "ANALYSED"

    # Compute overall score (weighted)
    weights = {"screening": 0.15, "financial": 0.30, "risk": 0.25, "competitive": 0.20, "legal": 0.10}
    overall = sum(
        float(agent_results.get(k, {}).get("score", 50)) * w
        for k, w in weights.items()
    )
    deal["overall_score"] = round(overall, 1)

    # Determine recommendation
    if overall >= 72:
        deal["recommendation"] = "BUY — Recommend Proceeding to Exclusivity"
    elif overall >= 55:
        deal["recommendation"] = "HOLD — Further Diligence Required"
    else:
        deal["recommendation"] = "PASS — Do Not Proceed"

    logger.info(
        "[Agents] All agents completed for deal %s. Score=%.1f, Rec=%s",
        deal_id, overall, deal["recommendation"]
    )

    return {
        "deal_id": deal_id,
        "overall_score": deal["overall_score"],
        "recommendation": deal["recommendation"],
        "agent_scores": {k: v.get("score") for k, v in agent_results.items()},
        "status": "ANALYSED",
    }


@router.post("/run/{deal_id}/{agent_name}")
async def run_single_agent(deal_id: str, agent_name: str) -> dict[str, Any]:
    """Run a single named agent for a deal."""
    if agent_name not in AGENT_REGISTRY:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown agent {agent_name!r}. Valid: {list(AGENT_REGISTRY)}"
        )
    deal = _deals.get(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail=f"Deal {deal_id!r} not found")

    _, result_dict = await _run_agent(agent_name, deal)

    # Store result
    if "agent_results" not in deal:
        deal["agent_results"] = {}
    analysis = result_dict.get("analysis", {})
    analysis["score"] = result_dict.get("score", 50)
    deal["agent_results"][agent_name] = analysis

    logger.info("[Agents] Single agent %s completed for deal %s", agent_name, deal_id)
    return {
        "deal_id": deal_id,
        "agent": agent_name,
        "score": result_dict.get("score"),
        "duration_ms": result_dict.get("duration_ms"),
        "analysis": analysis,
    }


@router.get("/results/{deal_id}")
async def get_results(deal_id: str) -> dict[str, Any]:
    """Return stored agent results for a deal."""
    deal = _deals.get(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail=f"Deal {deal_id!r} not found")
    return {
        "deal_id": deal_id,
        "status": deal.get("status"),
        "overall_score": deal.get("overall_score"),
        "recommendation": deal.get("recommendation"),
        "agent_results": deal.get("agent_results", {}),
    }
