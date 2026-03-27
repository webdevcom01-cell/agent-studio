"""
Agent 4: Competitive Intelligence Agent
Porter's Five Forces, competitor mapping, market share, positioning analysis.
"""
from __future__ import annotations
from typing import Any
from backend.agents.base_agent import BaseAgent, AgentResult

SYSTEM_PROMPT = """You are a Partner at a leading strategy consulting firm (McKinsey / BCG level)
specialising in competitive intelligence for M&A transactions.

Conduct a rigorous competitive analysis using Porter's Five Forces and strategic positioning frameworks.
Respond with a single valid JSON object only.

Schema:
{
  "score": <float 0-100, where 100 = strongest competitive position>,
  "market_position": "LEADER" | "CHALLENGER" | "FOLLOWER" | "NICHE",
  "estimated_market_share_pct": <number>,
  "porters_five_forces": {
    "competitive_rivalry":     {"score": <1-5>, "description": "...", "key_players": ["..."]},
    "threat_of_new_entrants":  {"score": <1-5>, "description": "...", "barriers": ["..."]},
    "bargaining_power_buyers": {"score": <1-5>, "description": "...", "factors": ["..."]},
    "bargaining_power_suppliers": {"score": <1-5>, "description": "...", "factors": ["..."]},
    "threat_of_substitutes":   {"score": <1-5>, "description": "...", "alternatives": ["..."]}
  },
  "competitor_map": [
    {
      "name": "...",
      "type": "DIRECT" | "INDIRECT" | "POTENTIAL",
      "market_share_pct": <number>,
      "strengths": ["..."],
      "weaknesses": ["..."],
      "recent_moves": "..."
    }
  ],
  "competitive_advantages": ["...", "..."],
  "competitive_vulnerabilities": ["...", "..."],
  "m&a_landscape": {
    "recent_transactions": ["..."],
    "valuation_benchmarks": "...",
    "consolidation_trend": "ACCELERATING" | "STABLE" | "DECELERATING"
  },
  "strategic_recommendations": ["...", "..."],
  "summary": "..."
}"""

USER_TEMPLATE = """Conduct competitive intelligence analysis for this M&A target:

Company: {name}
Industry: {industry}
Country: {country}
Description: {description}
Employees: {employee_count}
Revenue: ${revenue_usd:,.0f}
Deal Value: ${deal_value_usd:,.0f}

Known Competitors / Market Context:
{competitors}

Prior Analysis:
{prior_analysis}

Deliver a complete competitive landscape assessment in JSON."""


class CompetitiveAgent(BaseAgent):
    name = "competitive"

    async def analyse(self, deal_data: dict[str, Any]) -> AgentResult:
        user_prompt = USER_TEMPLATE.format(
            name=deal_data.get("company_name", "Unknown"),
            industry=deal_data.get("industry", "N/A"),
            country=deal_data.get("country", "N/A"),
            description=deal_data.get("description", "N/A"),
            employee_count=deal_data.get("employee_count", "N/A"),
            revenue_usd=deal_data.get("revenue_usd", 0),
            deal_value_usd=deal_data.get("deal_value_usd", 0),
            competitors=deal_data.get("competitors", "None specified — use industry knowledge."),
            prior_analysis=deal_data.get("prior_analysis", "No prior analysis."),
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
            "score": 75.0,
            "market_position": "CHALLENGER",
            "estimated_market_share_pct": 8.5,
            "porters_five_forces": {
                "competitive_rivalry":     {"score": 4, "description": "Crowded mid-market segment with 12+ active players", "key_players": ["Competitor A", "Competitor B", "Competitor C"]},
                "threat_of_new_entrants":  {"score": 2, "description": "High integration complexity deters greenfield entry", "barriers": ["Sales cycles 6-18 months", "Complex implementation", "Data network effects"]},
                "bargaining_power_buyers": {"score": 3, "description": "Mid-market buyers have moderate leverage; enterprise less so", "factors": ["Alternatives exist", "Switching costs rising after 12 months"]},
                "bargaining_power_suppliers": {"score": 2, "description": "Cloud infrastructure largely commoditised", "factors": ["Multi-cloud architecture reduces AWS lock-in"]},
                "threat_of_substitutes":   {"score": 2, "description": "Manual / spreadsheet processes are the main substitute", "alternatives": ["Excel + manual workflows", "Point-solution stitching"]}
            },
            "competitor_map": [
                {"name": "Market Leader Co", "type": "DIRECT", "market_share_pct": 25, "strengths": ["Brand recognition", "Enterprise sales force"], "weaknesses": ["Legacy tech stack", "Poor NPS"], "recent_moves": "Raised $200M Series E"},
                {"name": "Niche Player X",  "type": "DIRECT", "market_share_pct": 6,  "strengths": ["Best-in-class UX"],  "weaknesses": ["Limited integrations"], "recent_moves": "Acquired SMB workflow tool"}
            ],
            "competitive_advantages": [
                "Superior API ecosystem with 150+ native integrations",
                "NPS of 67 vs. industry average of 31",
                "Fastest time-to-value in category (avg. 6 weeks vs. 6 months)"
            ],
            "competitive_vulnerabilities": [
                "No dedicated enterprise tier — at risk from upmarket competitors",
                "Limited brand awareness outside home market"
            ],
            "m&a_landscape": {
                "recent_transactions": [
                    "Competitor A acquired for 15x ARR ($420M) — Q3 2024",
                    "Strategic B bought Niche Player for 10x ARR — Q1 2024"
                ],
                "valuation_benchmarks": "Comparable SaaS transactions trading at 10-16x ARR; target at 12x is in-line",
                "consolidation_trend": "ACCELERATING"
            },
            "strategic_recommendations": [
                "Prioritise enterprise up-sell motion post-close to defend against downmarket pressure",
                "Accelerate DACH and Nordics expansion ahead of incumbent's international push",
                "Consider acqui-hire of AI-native competitor to leapfrog product roadmap"
            ],
            "summary": (
                "Strong challenger position in a consolidating market. Differentiated product with "
                "measurable customer satisfaction advantage. Accelerating M&A activity validates "
                "valuation and strategic rationale. Recommend proceeding."
            )
        }
