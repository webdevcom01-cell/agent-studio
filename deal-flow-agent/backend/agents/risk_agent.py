"""
Agent 3: Risk Assessment Agent
Identifies and scores all material deal risks — operational, financial, market, cyber.
"""
from __future__ import annotations
from typing import Any
from backend.agents.base_agent import BaseAgent, AgentResult

SYSTEM_PROMPT = """You are the Chief Risk Officer of a global private equity firm specialising in
technology and business services M&A. You assess ALL material risks: operational, financial,
market/macro, regulatory, ESG, cyber, and integration.

Score each risk by severity (1-5) and likelihood (1-5). Provide mitigations.
Respond with a single valid JSON object only.

Schema:
{
  "score": <float 0-100, where 100 = lowest risk / best risk profile>,
  "overall_risk_rating": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "risk_categories": {
    "operational": {
      "severity": <1-5>, "likelihood": <1-5>,
      "risks": [{"title": "...", "description": "...", "mitigation": "..."}]
    },
    "financial": {
      "severity": <1-5>, "likelihood": <1-5>,
      "risks": [{"title": "...", "description": "...", "mitigation": "..."}]
    },
    "market_macro": {
      "severity": <1-5>, "likelihood": <1-5>,
      "risks": [{"title": "...", "description": "...", "mitigation": "..."}]
    },
    "regulatory_compliance": {
      "severity": <1-5>, "likelihood": <1-5>,
      "risks": [{"title": "...", "description": "...", "mitigation": "..."}]
    },
    "esg": {
      "severity": <1-5>, "likelihood": <1-5>,
      "risks": [{"title": "...", "description": "...", "mitigation": "..."}]
    },
    "cybersecurity": {
      "severity": <1-5>, "likelihood": <1-5>,
      "risks": [{"title": "...", "description": "...", "mitigation": "..."}]
    },
    "integration": {
      "severity": <1-5>, "likelihood": <1-5>,
      "risks": [{"title": "...", "description": "...", "mitigation": "..."}]
    }
  },
  "deal_breakers": ["...", "..."],
  "risk_adjusted_irr": <number>,
  "recommended_protections": ["earn-out structure", "MAC clause", "warranty & indemnity insurance"],
  "summary": "..."
}"""

USER_TEMPLATE = """Assess all material risks for this acquisition:

Company: {name} | Industry: {industry} | Country: {country}
Deal Value: ${deal_value_usd:,.0f} | Deal Type: {deal_type}
Employees: {employee_count}

FINANCIAL CONTEXT
  Revenue: ${revenue_usd:,.0f} | EBITDA: ${ebitda_usd:,.0f}
  Net Debt: ${net_debt_usd:,.0f}

SCREENING & FINANCIAL FINDINGS
{prior_analysis}

Additional: {notes}

Identify ALL material risks and return comprehensive risk assessment in JSON."""


class RiskAgent(BaseAgent):
    name = "risk"

    async def analyse(self, deal_data: dict[str, Any]) -> AgentResult:
        user_prompt = USER_TEMPLATE.format(
            name=deal_data.get("company_name", "Unknown"),
            industry=deal_data.get("industry", "N/A"),
            country=deal_data.get("country", "N/A"),
            deal_value_usd=deal_data.get("deal_value_usd", 0),
            deal_type=deal_data.get("deal_type", "acquisition"),
            employee_count=deal_data.get("employee_count", "N/A"),
            revenue_usd=deal_data.get("revenue_usd", 0),
            ebitda_usd=deal_data.get("ebitda_usd", 0),
            net_debt_usd=deal_data.get("net_debt_usd", 0),
            prior_analysis=deal_data.get("prior_analysis", "No prior analysis available."),
            notes=deal_data.get("notes", "None"),
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
            "score": 64.0,
            "overall_risk_rating": "MEDIUM",
            "risk_categories": {
                "operational": {
                    "severity": 3, "likelihood": 2,
                    "risks": [{
                        "title": "Key Person Dependency",
                        "description": "CEO/Founder drives 60% of key client relationships",
                        "mitigation": "Long-term retention package + management equity plan"
                    }]
                },
                "financial": {
                    "severity": 3, "likelihood": 3,
                    "risks": [{
                        "title": "Revenue Concentration",
                        "description": "Top 3 customers represent 45% of ARR",
                        "mitigation": "Earn-out tied to customer diversification milestones"
                    }]
                },
                "market_macro": {
                    "severity": 2, "likelihood": 3,
                    "risks": [{
                        "title": "Interest Rate Sensitivity",
                        "description": "Higher rates compress exit multiples for software assets",
                        "mitigation": "Sensitivity analysis run; base case remains above hurdle at 12x exit"
                    }]
                },
                "regulatory_compliance": {
                    "severity": 2, "likelihood": 2,
                    "risks": [{
                        "title": "GDPR / Data Privacy",
                        "description": "Processes sensitive customer data; EU expansion requires DPA compliance",
                        "mitigation": "Legal diligence + appoint DPO post-close"
                    }]
                },
                "esg": {
                    "severity": 1, "likelihood": 1,
                    "risks": [{"title": "No material ESG risks identified", "description": "Software business with low environmental footprint", "mitigation": "Standard ESG reporting to be implemented"}]
                },
                "cybersecurity": {
                    "severity": 4, "likelihood": 2,
                    "risks": [{
                        "title": "Legacy Authentication Infrastructure",
                        "description": "Pre-SSO auth modules in 3 legacy product lines; potential breach surface",
                        "mitigation": "Cyber vendor assessment pre-close; 100-day remediation plan"
                    }]
                },
                "integration": {
                    "severity": 3, "likelihood": 3,
                    "risks": [{
                        "title": "Cultural Integration",
                        "description": "Startup culture may clash with PE ownership cadence",
                        "mitigation": "Dedicated integration manager; 12-month culture bridge programme"
                    }]
                }
            },
            "deal_breakers": [],
            "risk_adjusted_irr": 19.5,
            "recommended_protections": [
                "Management retention escrow (18-month cliff)",
                "W&I insurance (£5M excess, £50M limit)",
                "MAC clause with specific revenue concentration carve-out",
                "Cyber escrow of $3M pending post-close remediation sign-off"
            ],
            "summary": (
                "Medium overall risk profile. No deal-breakers identified. "
                "Primary concerns are revenue concentration and cybersecurity posture. "
                "Both are manageable with appropriate deal structuring and 100-day plan."
            )
        }
