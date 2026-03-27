"""
Crunchbase API integration.
Real mode: uses the Crunchbase Basic API (v4).
Demo mode: returns rich mock data when CRUNCHBASE_API_KEY is not set.
"""
from __future__ import annotations
import logging
from typing import Any, Optional

import httpx

from backend.config import settings

logger = logging.getLogger(__name__)

CRUNCHBASE_BASE = "https://api.crunchbase.com/api/v4"


class CrunchbaseClient:
    """Wrapper around the Crunchbase Basic API."""

    def __init__(self):
        self.api_key = settings.CRUNCHBASE_API_KEY
        self._headers = {"X-cb-user-key": self.api_key}

    async def get_organization(self, domain_or_permalink: str) -> Optional[dict[str, Any]]:
        """Fetch company data from Crunchbase by domain or permalink."""
        if not self.api_key:
            logger.info("[Crunchbase] No API key — returning mock data")
            return self._mock_organization(domain_or_permalink)

        params = {
            "user_key": self.api_key,
            "field_ids": ",".join([
                "short_description", "founded_on", "num_employees_enum",
                "total_funding_usd", "last_funding_type", "last_funding_total",
                "ipo_status", "categories", "headquarters_location",
                "website_url", "linkedin", "num_funding_rounds",
            ])
        }
        permalink = domain_or_permalink.replace(".", "-")
        url = f"{CRUNCHBASE_BASE}/entities/organizations/{permalink}"

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                data = resp.json()
                return self._normalize(data.get("properties", {}))
        except httpx.HTTPStatusError as exc:
            logger.warning("[Crunchbase] HTTP %s for %s", exc.response.status_code, domain_or_permalink)
            return self._mock_organization(domain_or_permalink)
        except Exception as exc:
            logger.warning("[Crunchbase] Error: %s", exc)
            return self._mock_organization(domain_or_permalink)

    async def search_organizations(
        self,
        name: str,
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        """Search Crunchbase for organizations matching a name."""
        if not self.api_key:
            return [self._mock_organization(name)]

        payload = {
            "field_ids": ["identifier", "short_description", "website_url", "num_employees_enum"],
            "query": [{"type": "predicate", "field_id": "facet_ids", "operator_id": "includes", "values": ["company"]}],
            "limit": limit,
        }
        # Crunchbase Basic doesn't support full-text search on org name via REST — use autocomplete
        url = f"{CRUNCHBASE_BASE}/autocompletes"
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    url,
                    params={"user_key": self.api_key, "query": name, "collection_ids": "organizations", "limit": limit}
                )
                resp.raise_for_status()
                return resp.json().get("entities", [])
        except Exception as exc:
            logger.warning("[Crunchbase] Search error: %s", exc)
            return [self._mock_organization(name)]

    # ── Normalisation ─────────────────────────────────────────────────────────

    def _normalize(self, props: dict[str, Any]) -> dict[str, Any]:
        return {
            "source": "crunchbase",
            "description": props.get("short_description", ""),
            "founded_year": (props.get("founded_on") or {}).get("value", "")[:4],
            "employee_range": props.get("num_employees_enum", ""),
            "total_funding_usd": props.get("total_funding_usd", 0),
            "last_funding_type": props.get("last_funding_type", ""),
            "funding_rounds": props.get("num_funding_rounds", 0),
            "ipo_status": props.get("ipo_status", "private"),
            "categories": [c.get("value", "") for c in (props.get("categories") or [])],
            "location": (props.get("headquarters_location") or {}).get("value", ""),
            "website": props.get("website_url", ""),
            "linkedin": (props.get("linkedin") or {}).get("value", ""),
        }

    def _mock_organization(self, name: str) -> dict[str, Any]:
        return {
            "source": "crunchbase_mock",
            "name": name,
            "description": f"Leading B2B SaaS platform serving mid-market enterprises globally",
            "founded_year": "2017",
            "employee_range": "101-250",
            "total_funding_usd": 45_000_000,
            "last_funding_type": "Series B",
            "funding_rounds": 3,
            "ipo_status": "private",
            "categories": ["Enterprise Software", "SaaS", "B2B"],
            "location": "London, England, United Kingdom",
            "website": f"https://www.{name.lower().replace(' ', '')}.com",
            "linkedin": f"https://www.linkedin.com/company/{name.lower().replace(' ', '-')}",
            "investors": ["Accel", "Balderton Capital", "Index Ventures"],
        }
