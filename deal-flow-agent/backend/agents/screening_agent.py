"""
Agent 1: Screening Agent
Initial deal qualification — strategic fit, market size, management quality.
"""
from __future__ import annotations
from typing import Any
from backend.agents.base_agent import BaseAgent, AgentResult

SYSTEM_PROMPT = """You are a Senior M&A Deal Screener at a top-tier private equity firm.
Your job is to perform an initial qualitative screen of acquisition targets.

Evaluate: strategic fit, market attractiveness, management quality, growth trajectory,
competitive moat, and ESG considerations.

Always respond with a single valid JSON object — no markdown, no preamble.
Schema:
{
  "score": <float 0-100>,
  "recommendation": "PROCEED" | "PASS" | "WATCH",
  "strategic_fit": {
    "rating": "HIGH" | "MEDIUM" | "LOW",
    "rationale": "..."
  },
  "market_attractiveness": {
    "tam_estimate_usd": <number>,
    "growth_rate_pct": <number>,
    "maturity": "EMERGING" | "GROWING" | "MATURE" | "DECLINING",
    "key_trends": ["...", "..."]
  },
  "management_quality": {
    "rating": "STRONG" | "ADEQUATE" | "WEAK",
    "highlights": ["...", "..."],
    "concerns": ["...", "..."]
  },
  "competitive_moat": {
    "moat_type": "BRAND" | "SWITCHING_COST" | "NETWORK_EFFECT" | "COST" | "NONE",
    "strength": "STRONG" | "MODERATE" | "WEAK",
    "description": "..."
  },
  "red_flags": ["...", "..."],
  "green_flags": ["...", "..."],
  "next_steps": ["...", "..."],
  "summary": "..."
}"""

USER_TEMPLATE = """Screen this acquisition target:

Company: {name}
Industry: {industry}
Country: {country}
Founded: {founded_year}
Employees: {employee_count}
Description: {description}
Deal Type: {deal_type}
Deal Value: ${deal_value_usd:,.0f}
Revenue (LTM): ${revenue_usd:,.0f}
EBITDA (LTM): ${ebitda_usd:,.0f}
Additional Context: {notes}

Additional data from Crunchbase/LinkedIn:
{enriched_data}

Provide your screening analysis as JSON."""


class ScreeningAgent(BaseAgent):
    name = "screening"

    async def analyse(self, deal_data: dict[str, Any]) -> AgentResult:
        user_prompt = USER_TEMPLATE.format(
            name=deal_data.get("company_name", "Unknown"),
            industry=deal_data.get("industry", "N/A"),
            country=deal_data.get("country", "N/A"),
            founded_year=deal_data.get("founded_year", "N/A"),
            employee_count=deal_data.get("employee_count", "N/A"),
            description=deal_data.get("description", "N/A"),
            deal_type=deal_data.get("deal_type", "acquisition"),
            deal_value_usd=deal_data.get("deal_value_usd", 0),
            revenue_usd=deal_data.get("revenue_usd", 0),
            ebitda_usd=deal_data.get("ebitda_usd", 0),
            notes=deal_data.get("notes", "None"),
            enriched_data=deal_data.get("enriched_data", "{}"),
        )
        raw, in_tok, out_tok = await self._call_llm(SYSTEM_PROMPT, user_prompt)
        parsed = self._parse_json_response(raw)
        return AgentResult(
            agent_name=self.name,
            score=float(parsed.get("score", 50)),
            analysis=parsed,
            raw_response=raw,
            input_tokens=in_tok,
            output_tokens=out_tok,
        )

    def _mock_response(self) -> dict[str, Any]:
        return {
            "score": 72.0,
            "recommendation": "PROCEED",
            "strategic_fit": {
                "rating": "HIGH",
                "rationale": "Strong alignment with portfolio thesis in vertical SaaS"
            },
            "market_attractiveness": {
                "tam_estimate_usd": 4_500_000_000,
                "growth_rate_pct": 18.5,
                "maturity": "GROWING",
                "key_trends": [
                    "Accelerating digital transformation in target sector",
                    "Consolidation opportunity as market fragments",
                    "Regulatory tailwind in EU and US"
                ]
            },
            "management_quality": {
                "rating": "STRONG",
                "highlights": ["Founder-led with deep domain expertise", "Low management turnover"],
                "concerns": ["CFO seat open", "Limited PE experience"]
            },
            "competitive_moat": {
                "moat_type": "SWITCHING_COST",
                "strength": "MODERATE",
                "description": "Deep ERP integrations create meaningful switching friction"
            },
            "red_flags": ["Revenue concentration — top 3 customers = 45% of ARR"],
            "green_flags": ["NRR > 120%", "ARR growing 40% YoY", "Profitable at EBITDA level"],
            "next_steps": [
                "Request 3-year financial model from management",
                "Arrange management presentation",
                "Commission market study"
            ],
            "summary": (
                "Compelling target with strong product-market fit and defensible market position. "
                "Revenue concentration is the primary concern. Recommend proceeding to financial diligence."
            )
        }
