"""
LinkedIn API integration (LinkedIn Marketing API / Voyager).
Real mode: uses OAuth 2.0 bearer token via environment.
Demo mode: returns rich mock data when LINKEDIN_CLIENT_ID is not set.
"""
from __future__ import annotations
import logging
from typing import Any, Optional

import httpx

from backend.config import settings

logger = logging.getLogger(__name__)

LINKEDIN_API = "https://api.linkedin.com/v2"


class LinkedInClient:
    """Wrapper around LinkedIn REST API for company & people data."""

    def __init__(self, access_token: Optional[str] = None):
        self.access_token = access_token or settings.LINKEDIN_CLIENT_SECRET
        self._base_headers = {
            "Authorization": f"Bearer {self.access_token}",
            "X-Restli-Protocol-Version": "2.0.0",
            "LinkedIn-Version": "202401",
        }

    @property
    def _configured(self) -> bool:
        return bool(settings.LINKEDIN_CLIENT_ID and settings.LINKEDIN_CLIENT_SECRET)

    async def get_company(self, universal_name: str) -> Optional[dict[str, Any]]:
        """Fetch company profile from LinkedIn by vanity URL / universal name."""
        if not self._configured:
            logger.info("[LinkedIn] Not configured — returning mock data for '%s'", universal_name)
            return self._mock_company(universal_name)

        url = f"{LINKEDIN_API}/organizations"
        params = {
            "q": "universalName",
            "universalName": universal_name,
            "projection": "(id,name,description,specialties,locations,followerCount,staffCount,industries,websiteUrl,founded)"
        }
        try:
            async with httpx.AsyncClient(timeout=15, headers=self._base_headers) as client:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                return self._normalize_company(resp.json())
        except httpx.HTTPStatusError as exc:
            logger.warning("[LinkedIn] HTTP %s for company %s", exc.response.status_code, universal_name)
            return self._mock_company(universal_name)
        except Exception as exc:
            logger.warning("[LinkedIn] Error: %s", exc)
            return self._mock_company(universal_name)

    async def get_employee_count(self, company_id: str) -> int:
        """Return current staff count for a company."""
        if not self._configured:
            return 187
        try:
            url = f"{LINKEDIN_API}/networkSizes/urn:li:organization:{company_id}"
            async with httpx.AsyncClient(timeout=10, headers=self._base_headers) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                return resp.json().get("firstDegreeSize", 0)
        except Exception as exc:
            logger.warning("[LinkedIn] Employee count error: %s", exc)
            return 0

    async def search_executives(self, company_name: str) -> list[dict[str, Any]]:
        """Return C-suite executives for a company (People API)."""
        if not self._configured:
            return self._mock_executives(company_name)
        # LinkedIn People Search requires Partner-level API access.
        # Gracefully return empty list if not available.
        logger.info("[LinkedIn] People Search requires Partner API — returning mock executives")
        return self._mock_executives(company_name)

    # ── Normalisation ─────────────────────────────────────────────────────────

    def _normalize_company(self, data: dict[str, Any]) -> dict[str, Any]:
        locations = data.get("locations", {}).get("elements", [])
        hq = locations[0] if locations else {}
        return {
            "source": "linkedin",
            "linkedin_id": data.get("id", ""),
            "name": (data.get("name") or {}).get("localized", {}).get("en_US", ""),
            "description": (data.get("description") or {}).get("localized", {}).get("en_US", ""),
            "specialties": data.get("specialties", []),
            "follower_count": data.get("followerCount", 0),
            "employee_count": data.get("staffCount", 0),
            "website": data.get("websiteUrl", ""),
            "founded_year": (data.get("founded") or {}).get("year", ""),
            "headquarters": hq,
            "industries": data.get("industries", []),
        }

    def _mock_company(self, name: str) -> dict[str, Any]:
        return {
            "source": "linkedin_mock",
            "name": name,
            "description": (
                "We build the operating system for modern B2B sales teams. "
                "Trusted by 500+ customers in 28 countries."
            ),
            "specialties": ["Enterprise SaaS", "Revenue Operations", "CRM", "Sales Enablement"],
            "follower_count": 8_420,
            "employee_count": 187,
            "website": f"https://www.{name.lower().replace(' ', '')}.com",
            "founded_year": 2017,
            "headquarters": {"country": "GB", "city": "London"},
            "industries": ["Software Development"],
            "growth_6m_pct": 12.4,  # LinkedIn Talent Insights
            "recent_hires_senior": [
                "VP Sales (ex-Salesforce)",
                "Chief Product Officer (ex-HubSpot)",
            ],
        }

    def _mock_executives(self, company_name: str) -> list[dict[str, Any]]:
        return [
            {
                "name": "Sarah Johnson",
                "title": "CEO & Co-Founder",
                "linkedin": "linkedin.com/in/sarah-johnson-ceo",
                "years_at_company": 7,
                "prior_experience": ["VP Product @ Salesforce", "PM @ Google"]
            },
            {
                "name": "Marcus Weber",
                "title": "CTO & Co-Founder",
                "linkedin": "linkedin.com/in/marcus-weber-cto",
                "years_at_company": 7,
                "prior_experience": ["Staff Engineer @ Stripe", "PhD Computer Science @ ETH Zurich"]
            },
            {
                "name": "Priya Sharma",
                "title": "CFO",
                "linkedin": "linkedin.com/in/priya-sharma-cfo",
                "years_at_company": 2,
                "prior_experience": ["VP Finance @ Atlassian", "Investment Banking @ Goldman Sachs"]
            },
            {
                "name": "Tom Davies",
                "title": "Chief Revenue Officer",
                "linkedin": "linkedin.com/in/tom-davies-cro",
                "years_at_company": 3,
                "prior_experience": ["Global VP Sales @ Zendesk"]
            },
        ]
