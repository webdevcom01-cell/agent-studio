"""
Agent 2: Financial Agent
Deep financial analysis — valuation, returns, quality of earnings, LBO model.
"""
from __future__ import annotations
from typing import Any
from backend.agents.base_agent import BaseAgent, AgentResult

SYSTEM_PROMPT = """You are a Managing Director of Financial Diligence at a bulge-bracket M&A advisory firm.
You have 20 years of experience building and stress-testing financial models for leveraged buyouts,
mergers, and strategic acquisitions.

Analyse the financial profile of the acquisition target. Always respond with a single JSON object.
Schema:
{
  "score": <float 0-100>,
  "valuation": {
    "ev_ebitda_entry": <number>,
    "ev_revenue_entry": <number>,
    "dcf_implied_value_usd": <number>,
    "comps_implied_value_usd": <number>,
    "assessment": "CHEAP" | "FAIR" | "EXPENSIVE"
  },
  "quality_of_earnings": {
    "rating": "HIGH" | "MEDIUM" | "LOW",
    "recurring_revenue_pct": <number>,
    "one_time_items_usd": <number>,
    "adjusted_ebitda_usd": <number>,
    "key_adjustments": ["...", "..."]
  },
  "growth_profile": {
    "revenue_cagr_3yr": <number>,
    "ebitda_margin_current": <number>,
    "ebitda_margin_target": <number>,
    "growth_drivers": ["...", "..."]
  },
  "lbo_returns": {
    "entry_ev_usd": <number>,
    "exit_ev_usd": <number>,
    "hold_period_years": <number>,
    "debt_paydown_usd": <number>,
    "irr_base": <number>,
    "irr_upside": <number>,
    "irr_downside": <number>,
    "moic_base": <number>
  },
  "balance_sheet": {
    "net_debt_usd": <number>,
    "leverage_ratio": <number>,
    "working_capital_days": <number>,
    "capex_intensity": "HIGH" | "MEDIUM" | "LOW"
  },
  "risks": ["...", "..."],
  "value_creation_levers": ["...", "..."],
  "summary": "..."
}"""

USER_TEMPLATE = """Perform financial diligence on this M&A target:

Company: {name}
Industry: {industry}

FINANCIALS
  Deal Value (Enterprise Value): ${deal_value_usd:,.0f}
  Revenue (LTM): ${revenue_usd:,.0f}
  EBITDA (LTM): ${ebitda_usd:,.0f}
  EV/EBITDA Entry Multiple: {ev_ebitda:.1f}x
  Target IRR: {irr_target:.0f}%

SCREENING FINDINGS
{screening_summary}

Additional Notes: {notes}

Build a full LBO framework and return analysis in JSON."""


class FinancialAgent(BaseAgent):
    name = "financial"

    async def analyse(self, deal_data: dict[str, Any]) -> AgentResult:
        revenue = deal_data.get("revenue_usd", 1) or 1
        ebitda  = deal_data.get("ebitda_usd",  1) or 1
        ev      = deal_data.get("deal_value_usd", 0)
        ev_ebitda = ev / ebitda if ebitda else 0

        user_prompt = USER_TEMPLATE.format(
            name=deal_data.get("company_name", "Unknown"),
            industry=deal_data.get("industry", "N/A"),
            deal_value_usd=ev,
            revenue_usd=revenue,
            ebitda_usd=ebitda,
            ev_ebitda=ev_ebitda,
            irr_target=deal_data.get("irr_target", 20),
            screening_summary=deal_data.get("screening_summary", "No prior screening data."),
            notes=deal_data.get("notes", "None"),
        )
        raw, in_tok, out_tok = await self._call_llm(SYSTEM_PROMPT, user_prompt)
        parsed = self._parse_json_response(raw)
        return AgentResult(
            agent_name=self.name,
            score=float(parsed.get("score", 60)),
            analysis=parsed,
            raw_response=raw,
            input_tokens=in_tok,
            output_tokens=out_tok,
        )

    def _mock_response(self) -> dict[str, Any]:
        return {
            "score": 68.0,
            "valuation": {
                "ev_ebitda_entry": 12.5,
                "ev_revenue_entry": 3.8,
                "dcf_implied_value_usd": 285_000_000,
                "comps_implied_value_usd": 310_000_000,
                "assessment": "FAIR"
            },
            "quality_of_earnings": {
                "rating": "HIGH",
                "recurring_revenue_pct": 87,
                "one_time_items_usd": 2_500_000,
                "adjusted_ebitda_usd": 24_000_000,
                "key_adjustments": [
                    "Add-back: one-time restructuring charges $1.8M",
                    "Add-back: M&A transaction costs $0.7M"
                ]
            },
            "growth_profile": {
                "revenue_cagr_3yr": 32.0,
                "ebitda_margin_current": 22.0,
                "ebitda_margin_target": 30.0,
                "growth_drivers": [
                    "Land-and-expand motion in mid-market segment",
                    "International expansion (DACH, Nordics)",
                    "New product modules driving upsell"
                ]
            },
            "lbo_returns": {
                "entry_ev_usd": 300_000_000,
                "exit_ev_usd": 550_000_000,
                "hold_period_years": 5,
                "debt_paydown_usd": 75_000_000,
                "irr_base": 22.5,
                "irr_upside": 31.0,
                "irr_downside": 14.0,
                "moic_base": 2.8
            },
            "balance_sheet": {
                "net_debt_usd": 15_000_000,
                "leverage_ratio": 0.6,
                "working_capital_days": 45,
                "capex_intensity": "LOW"
            },
            "risks": [
                "Model sensitivity to churn assumptions (±100 bps = ±4% IRR)",
                "Multiple contraction risk in current rate environment",
                "Key-person dependency on founding CEO"
            ],
            "value_creation_levers": [
                "Operational improvement: sales & marketing efficiency",
                "M&A: tuck-in acquisitions in adjacent verticals",
                "Geographic expansion: North America push"
            ],
            "summary": (
                "Solid financial profile with high-quality recurring revenue and attractive "
                "growth trajectory. Base case IRR of 22.5% meets fund hurdle. "
                "Downside case at 14% remains acceptable. Proceed to full financial model."
            )
        }
