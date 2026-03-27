"""
Agent 5: Legal & Compliance Agent
IP review, regulatory approvals, contract risks, litigation, data protection.
"""
from __future__ import annotations
from typing import Any
from backend.agents.base_agent import BaseAgent, AgentResult

SYSTEM_PROMPT = """You are a Senior Partner at a Magic Circle law firm specialising in M&A.
You have 25 years of experience conducting legal due diligence across technology, SaaS, and
cross-border transactions.

Assess: IP ownership, regulatory/antitrust approvals, data protection compliance,
employment law, material contracts, litigation exposure, and deal structure.
Respond with a single valid JSON object only.

Schema:
{
  "score": <float 0-100, where 100 = cleanest legal profile>,
  "legal_risk_rating": "CLEAN" | "MANAGEABLE" | "SIGNIFICANT" | "DEAL_BREAKER",
  "ip_assessment": {
    "rating": "STRONG" | "ADEQUATE" | "WEAK",
    "owned_ip": ["...", "..."],
    "risks": ["...", "..."],
    "recommendations": ["...", "..."]
  },
  "regulatory_approvals": {
    "antitrust_filing_required": <bool>,
    "jurisdictions": ["..."],
    "estimated_timeline_months": <number>,
    "risk_level": "LOW" | "MEDIUM" | "HIGH"
  },
  "data_protection": {
    "gdpr_compliant": <bool>,
    "ccpa_compliant": <bool>,
    "data_residency_issues": ["...", "..."],
    "dpa_required": <bool>
  },
  "employment": {
    "employee_count": <number>,
    "key_agreements_in_place": <bool>,
    "tupe_applicable": <bool>,
    "issues": ["...", "..."]
  },
  "material_contracts": {
    "change_of_control_clauses": <number>,
    "customer_consent_required": <bool>,
    "key_risks": ["...", "..."]
  },
  "litigation": {
    "active_cases": <number>,
    "estimated_exposure_usd": <number>,
    "description": "..."
  },
  "deal_structure_recommendations": {
    "preferred_structure": "ASSET_PURCHASE" | "SHARE_PURCHASE" | "MERGER",
    "rationale": "...",
    "key_protections": ["...", "..."]
  },
  "conditions_precedent": ["...", "..."],
  "estimated_close_timeline_months": <number>,
  "summary": "..."
}"""

USER_TEMPLATE = """Conduct legal due diligence for this M&A transaction:

Target Company: {name}
Industry: {industry}
Country of Incorporation: {country}
Employees: {employee_count}
Deal Type: {deal_type}
Deal Value: ${deal_value_usd:,.0f}
Description: {description}

KEY KNOWN FACTS
{known_facts}

Prior Analysis Summary:
{prior_analysis}

Additional Context: {notes}

Provide comprehensive legal assessment in JSON."""


class LegalAgent(BaseAgent):
    name = "legal"

    async def analyse(self, deal_data: dict[str, Any]) -> AgentResult:
        user_prompt = USER_TEMPLATE.format(
            name=deal_data.get("company_name", "Unknown"),
            industry=deal_data.get("industry", "N/A"),
            country=deal_data.get("country", "N/A"),
            employee_count=deal_data.get("employee_count", "N/A"),
            deal_type=deal_data.get("deal_type", "acquisition"),
            deal_value_usd=deal_data.get("deal_value_usd", 0),
            description=deal_data.get("description", "N/A"),
            known_facts=deal_data.get("known_legal_facts", "No specific facts provided."),
            prior_analysis=deal_data.get("prior_analysis", "No prior analysis."),
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
            "score": 78.0,
            "legal_risk_rating": "MANAGEABLE",
            "ip_assessment": {
                "rating": "STRONG",
                "owned_ip": ["Core platform IP (patents pending)", "Trademark portfolio in 12 jurisdictions", "Proprietary ML models and training data"],
                "risks": ["3 open-source components with GPL-adjacent licences — need legal review"],
                "recommendations": ["Commission IP audit of OSS dependencies", "File defensive patents on 2 core algorithms"]
            },
            "regulatory_approvals": {
                "antitrust_filing_required": False,
                "jurisdictions": ["UK", "EU"],
                "estimated_timeline_months": 0,
                "risk_level": "LOW"
            },
            "data_protection": {
                "gdpr_compliant": True,
                "ccpa_compliant": True,
                "data_residency_issues": ["Customer data in US-East; EU customers require data localisation"],
                "dpa_required": True
            },
            "employment": {
                "employee_count": 187,
                "key_agreements_in_place": True,
                "tupe_applicable": False,
                "issues": ["15 contractors without written agreements", "Non-competes unenforceable in 2 US states"]
            },
            "material_contracts": {
                "change_of_control_clauses": 4,
                "customer_consent_required": False,
                "key_risks": [
                    "Enterprise licence agreement with Customer X requires 90-day CoC notification",
                    "AWS contract has usage commitment of $2.4M — may need renegotiation"
                ]
            },
            "litigation": {
                "active_cases": 1,
                "estimated_exposure_usd": 450_000,
                "description": "Employment tribunal claim from former senior employee — likely settlement"
            },
            "deal_structure_recommendations": {
                "preferred_structure": "SHARE_PURCHASE",
                "rationale": "Preserves customer contracts and regulatory licences; cleaner for SaaS business",
                "key_protections": [
                    "Comprehensive rep & warranty coverage",
                    "IP indemnity from sellers",
                    "Specific indemnity for OSS licence exposure",
                    "Escrow: 10% of consideration held for 18 months"
                ]
            },
            "conditions_precedent": [
                "Receipt of shareholder approval",
                "GDPR DPA execution with EU data processor",
                "Resolution of AWS contract renegotiation",
                "IP audit sign-off"
            ],
            "estimated_close_timeline_months": 4,
            "summary": (
                "Manageable legal risk profile. No deal-breakers. Key focus areas: "
                "OSS licence audit, 4 CoC consent notices, and data residency remediation. "
                "Share purchase structure recommended. Estimated close in 4 months."
            )
        }
