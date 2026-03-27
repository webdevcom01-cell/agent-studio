"""
Base agent — shared LLM call logic for all 5 M&A agents.
Supports Anthropic Claude and OpenAI GPT.
"""
from __future__ import annotations
import json
import time
import logging
from abc import ABC, abstractmethod
from typing import Any

from backend.config import settings

logger = logging.getLogger(__name__)


class AgentResult:
    def __init__(
        self,
        agent_name: str,
        score: float,
        analysis: dict[str, Any],
        raw_response: str,
        input_tokens: int = 0,
        output_tokens: int = 0,
        duration_ms: int = 0,
    ):
        self.agent_name    = agent_name
        self.score         = max(0.0, min(100.0, score))
        self.analysis      = analysis
        self.raw_response  = raw_response
        self.input_tokens  = input_tokens
        self.output_tokens = output_tokens
        self.duration_ms   = duration_ms

    def to_dict(self) -> dict[str, Any]:
        return {
            "agent_name":    self.agent_name,
            "score":         self.score,
            "analysis":      self.analysis,
            "input_tokens":  self.input_tokens,
            "output_tokens": self.output_tokens,
            "duration_ms":   self.duration_ms,
        }


class BaseAgent(ABC):
    """Abstract base for all Deal Flow agents."""

    name: str = "base"

    def __init__(self):
        self._client = None

    def _get_anthropic_client(self):
        if self._client is None:
            import anthropic
            self._client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY or "dummy")
        return self._client

    def _get_openai_client(self):
        if self._client is None:
            from openai import OpenAI
            self._client = OpenAI(api_key=settings.OPENAI_API_KEY or "dummy")
        return self._client

    async def _call_llm(self, system_prompt: str, user_prompt: str) -> tuple[str, int, int]:
        """Call LLM and return (text, input_tokens, output_tokens)."""
        # If no real API key — return a mock structured response for demo
        if not settings.ANTHROPIC_API_KEY and not settings.OPENAI_API_KEY:
            logger.warning("[%s] No API key configured — returning mock response", self.name)
            mock = self._mock_response()
            return json.dumps(mock, indent=2), 0, 0

        try:
            if settings.AI_PROVIDER == "anthropic" and settings.ANTHROPIC_API_KEY:
                return await self._call_anthropic(system_prompt, user_prompt)
            elif settings.OPENAI_API_KEY:
                return await self._call_openai(system_prompt, user_prompt)
            else:
                mock = self._mock_response()
                return json.dumps(mock, indent=2), 0, 0
        except Exception as exc:
            logger.error("[%s] LLM call failed: %s", self.name, exc)
            mock = self._mock_response()
            return json.dumps(mock, indent=2), 0, 0

    async def _call_anthropic(self, system_prompt: str, user_prompt: str) -> tuple[str, int, int]:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        msg = client.messages.create(
            model=settings.AI_MODEL,
            max_tokens=settings.MAX_TOKENS,
            temperature=settings.TEMPERATURE,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        text = msg.content[0].text if msg.content else ""
        return text, msg.usage.input_tokens, msg.usage.output_tokens

    async def _call_openai(self, system_prompt: str, user_prompt: str) -> tuple[str, int, int]:
        from openai import OpenAI
        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        resp = client.chat.completions.create(
            model="gpt-4o",
            max_tokens=settings.MAX_TOKENS,
            temperature=settings.TEMPERATURE,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_prompt},
            ],
        )
        text = resp.choices[0].message.content or ""
        usage = resp.usage
        return text, usage.prompt_tokens if usage else 0, usage.completion_tokens if usage else 0

    def _parse_json_response(self, raw: str) -> dict[str, Any]:
        """Extracts a JSON object from the LLM response."""
        try:
            # Try direct parse first
            return json.loads(raw)
        except json.JSONDecodeError:
            pass
        # Try to extract JSON block from markdown
        import re
        match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                pass
        # Fall back to mock
        logger.warning("[%s] Could not parse JSON from response, using mock", self.name)
        return self._mock_response()

    async def run(self, deal_data: dict[str, Any]) -> AgentResult:
        """Entry point — wraps analyse() with timing and error handling."""
        start = time.time()
        try:
            result = await self.analyse(deal_data)
            result.duration_ms = int((time.time() - start) * 1000)
            return result
        except Exception as exc:
            logger.error("[%s] analysis failed: %s", self.name, exc)
            mock = self._mock_response()
            return AgentResult(
                agent_name=self.name,
                score=mock.get("score", 50.0),
                analysis=mock,
                raw_response=str(exc),
                duration_ms=int((time.time() - start) * 1000),
            )

    @abstractmethod
    async def analyse(self, deal_data: dict[str, Any]) -> AgentResult:
        """Perform the domain-specific analysis."""

    @abstractmethod
    def _mock_response(self) -> dict[str, Any]:
        """Return a sensible demo response when no API key is configured."""
