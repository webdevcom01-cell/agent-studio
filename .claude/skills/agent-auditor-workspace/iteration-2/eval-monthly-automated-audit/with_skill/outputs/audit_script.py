#!/usr/bin/env python3
"""
Agent Studio — Monthly Automated Quality Audit
Evaluates all agents against a 10-dimension enterprise quality rubric.
Target: 8+/10 on all dimensions for production readiness.

Usage:
    python3 audit_script.py <DATABASE_URL>

Example:
    python3 audit_script.py "postgresql://postgres:testpass@tramway.proxy.rlwy.net:54364/railway"
"""

import sys
import json
import re
from datetime import datetime
from typing import Any, Dict, List, Tuple
from dataclasses import dataclass, asdict


@dataclass
class DimensionScore:
    """Single dimension scoring result."""
    name: str
    present: bool
    evidence: str


@dataclass
class AgentScore:
    """Complete audit score for one agent."""
    id: str
    name: str
    system_prompt: str
    prompt_length: int
    model: str
    is_public: bool
    created_at: str
    dimensions: List[DimensionScore]
    total_score: int
    missing_dimensions: List[str]
    category: str  # 'enterprise', 'needs_improvement', 'critical', 'delete'


class AuditEngine:
    """Core audit scoring and evaluation logic."""

    DIMENSION_NAMES = [
        "role",
        "output_format",
        "constraints",
        "json_schema",
        "examples",
        "failure_modes",
        "verification",
        "xml_depth",
        "decomposition",
        "hard_rules",
    ]

    MIN_PROMPT_LENGTH = 4000
    ENTERPRISE_THRESHOLD = 8
    NEEDS_IMPROVEMENT_MIN = 6
    DELETE_THRESHOLD = 100  # chars

    def __init__(self):
        self.agents: List[AgentScore] = []

    def score_all(self, agents_data: List[Tuple[str, str, str, str, bool, str]]) -> List[AgentScore]:
        """Score all agents from database records."""
        self.agents = []
        for agent_id, name, prompt, model, is_public, created_at in agents_data:
            score = self.score_agent(agent_id, name, prompt, model, is_public, created_at)
            self.agents.append(score)
        return self.agents

    def score_agent(
        self,
        agent_id: str,
        name: str,
        prompt: str,
        model: str,
        is_public: bool,
        created_at: str,
    ) -> AgentScore:
        """Score a single agent on all 10 dimensions."""

        prompt_clean = prompt.strip() if prompt else ""
        length = len(prompt_clean)

        # Check for delete candidates first
        if length <= self.DELETE_THRESHOLD or prompt_clean == "You are a helpful assistant.":
            return AgentScore(
                id=agent_id,
                name=name,
                system_prompt=prompt_clean,
                prompt_length=length,
                model=model,
                is_public=is_public,
                created_at=created_at,
                dimensions=[],
                total_score=0,
                missing_dimensions=self.DIMENSION_NAMES,
                category="delete",
            )

        # Score each dimension
        dimensions: List[DimensionScore] = [
            self._check_role(prompt_clean),
            self._check_output_format(prompt_clean),
            self._check_constraints(prompt_clean),
            self._check_json_schema(prompt_clean),
            self._check_examples(prompt_clean),
            self._check_failure_modes(prompt_clean),
            self._check_verification(prompt_clean),
            self._check_xml_depth(prompt_clean),
            self._check_decomposition(prompt_clean),
            self._check_hard_rules(prompt_clean),
        ]

        total = sum(1 for d in dimensions if d.present)
        missing = [d.name for d in dimensions if not d.present]

        # Apply length penalty
        if length < self.MIN_PROMPT_LENGTH:
            total = max(0, total - 1)
            missing.append("prompt_length")

        # Determine category
        if total >= self.ENTERPRISE_THRESHOLD:
            category = "enterprise"
        elif total >= self.NEEDS_IMPROVEMENT_MIN:
            category = "needs_improvement"
        else:
            category = "critical"

        return AgentScore(
            id=agent_id,
            name=name,
            system_prompt=prompt_clean,
            prompt_length=length,
            model=model,
            is_public=is_public,
            created_at=created_at,
            dimensions=dimensions,
            total_score=total,
            missing_dimensions=missing,
            category=category,
        )

    def _check_role(self, prompt: str) -> DimensionScore:
        """Dimension 1: <role> block present."""
        present = "<role>" in prompt
        evidence = "Found <role> tag" if present else "Missing <role> block"
        return DimensionScore("role", present, evidence)

    def _check_output_format(self, prompt: str) -> DimensionScore:
        """Dimension 2: <output_format> or <output> section."""
        present = "<output_format>" in prompt or "<output>" in prompt
        evidence = "Found output specification" if present else "Missing output format"
        return DimensionScore("output_format", present, evidence)

    def _check_constraints(self, prompt: str) -> DimensionScore:
        """Dimension 3: <constraints> section."""
        present = "<constraints>" in prompt
        evidence = "Found constraints block" if present else "Missing constraints"
        return DimensionScore("constraints", present, evidence)

    def _check_json_schema(self, prompt: str) -> DimensionScore:
        """Dimension 4: JSON schema defined (```json block)."""
        present = "```json" in prompt
        evidence = "Found JSON schema" if present else "No JSON schema block"
        return DimensionScore("json_schema", present, evidence)

    def _check_examples(self, prompt: str) -> DimensionScore:
        """Dimension 5: Examples present (<example tag or example: keyword)."""
        present = "<example" in prompt or "example:" in prompt.lower()
        evidence = "Found examples" if present else "No examples provided"
        return DimensionScore("examples", present, evidence)

    def _check_failure_modes(self, prompt: str) -> DimensionScore:
        """Dimension 6: Failure modes defined."""
        has_failure_tag = "<failure_modes>" in prompt
        has_keywords = any(
            kw in prompt.lower()
            for kw in ["fail", "handling", "modes", "graceful"]
        )
        present = has_failure_tag or has_keywords
        evidence = "Failure handling defined" if present else "No failure mode handling"
        return DimensionScore("failure_modes", present, evidence)

    def _check_verification(self, prompt: str) -> DimensionScore:
        """Dimension 7: Verification criteria."""
        present = any(kw in prompt.lower() for kw in ["verif", "validat"])
        evidence = "Verification specified" if present else "No verification criteria"
        return DimensionScore("verification", present, evidence)

    def _check_xml_depth(self, prompt: str) -> DimensionScore:
        """Dimension 8: XML structure depth (>=4 XML tags)."""
        tag_count = prompt.count("<")
        present = tag_count >= 4
        evidence = f"Found {tag_count} XML tags" if present else f"Only {tag_count} tags (need 4+)"
        return DimensionScore("xml_depth", present, evidence)

    def _check_decomposition(self, prompt: str) -> DimensionScore:
        """Dimension 9: Phased/decomposed approach."""
        present = any(
            kw in prompt.lower()
            for kw in ["phase", "step", "decompos"]
        )
        evidence = "Phased approach detected" if present else "No decomposition strategy"
        return DimensionScore("decomposition", present, evidence)

    def _check_hard_rules(self, prompt: str) -> DimensionScore:
        """Dimension 10: Hard rules (never/must/always)."""
        present = any(
            kw in prompt.lower()
            for kw in ["never", "must not", "always"]
        )
        evidence = "Hard rules present" if present else "No hard constraint rules"
        return DimensionScore("hard_rules", present, evidence)

    def get_summary(self) -> Dict[str, Any]:
        """Generate audit summary statistics."""
        enterprise = [a for a in self.agents if a.category == "enterprise"]
        needs_improvement = [a for a in self.agents if a.category == "needs_improvement"]
        critical = [a for a in self.agents if a.category == "critical"]
        deletes = [a for a in self.agents if a.category == "delete"]

        # Dimension coverage across all agents
        coverage = {}
        for dim_name in self.DIMENSION_NAMES:
            count = sum(
                1 for agent in self.agents
                if any(d.name == dim_name and d.present for d in agent.dimensions)
            )
            coverage[dim_name] = {
                "count": count,
                "total": len(self.agents),
                "percentage": (count / len(self.agents) * 100) if self.agents else 0,
            }

        lengths = [a.prompt_length for a in self.agents if a.prompt_length > 0]
        avg_length = sum(lengths) / len(lengths) if lengths else 0

        return {
            "audit_date": datetime.now().isoformat(),
            "total_agents": len(self.agents),
            "enterprise_count": len(enterprise),
            "needs_improvement_count": len(needs_improvement),
            "critical_count": len(critical),
            "delete_candidates": len(deletes),
            "average_prompt_length": int(avg_length),
            "min_prompt_length": min(lengths) if lengths else 0,
            "max_prompt_length": max(lengths) if lengths else 0,
            "dimension_coverage": coverage,
            "enterprise_list": [
                {"name": a.name, "score": a.total_score, "length": a.prompt_length}
                for a in sorted(enterprise, key=lambda x: x.name)
            ],
            "needs_improvement_list": [
                {
                    "name": a.name,
                    "score": a.total_score,
                    "missing": a.missing_dimensions[:3],
                }
                for a in sorted(needs_improvement, key=lambda x: x.total_score)
            ],
            "critical_list": [
                {
                    "name": a.name,
                    "score": a.total_score,
                    "missing": a.missing_dimensions[:3],
                }
                for a in sorted(critical, key=lambda x: x.total_score)
            ],
            "delete_candidates_list": [
                {"name": a.name, "length": a.prompt_length}
                for a in sorted(deletes, key=lambda x: x.prompt_length)
            ],
        }


def main():
    """Main audit workflow."""
    if len(sys.argv) < 2:
        print("Usage: python3 audit_script.py <DATABASE_URL>")
        print("Example: python3 audit_script.py 'postgresql://user:pass@host:port/db'")
        sys.exit(1)

    db_url = sys.argv[1]
    print(f"\n{'='*70}")
    print("AGENT STUDIO — MONTHLY AUTOMATED QUALITY AUDIT")
    print(f"{'='*70}\n")

    # Try to connect to database
    try:
        import psycopg2
    except ImportError:
        print("ERROR: psycopg2 not installed. Install with: pip install psycopg2-binary")
        sys.exit(1)

    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        print("[DATABASE] Connected to Railway PostgreSQL")
    except Exception as e:
        print(f"[DATABASE] Connection failed (expected if Railway unreachable): {e}")
        print("[DEMO MODE] Using synthetic agent data instead\n")
        agents_data = _get_demo_agents()
    else:
        try:
            cur.execute(
                'SELECT id, name, "systemPrompt", model, "isPublic", "createdAt" FROM "Agent" ORDER BY name'
            )
            agents_data = cur.fetchall()
            cur.close()
            conn.close()
            print(f"[DATABASE] Retrieved {len(agents_data)} agents\n")
        except Exception as e:
            print(f"[DATABASE] Query failed: {e}")
            print("[DEMO MODE] Using synthetic agent data instead\n")
            agents_data = _get_demo_agents()

    # Run audit
    engine = AuditEngine()
    engine.score_all(agents_data)

    # Generate summary
    summary = engine.get_summary()

    # Print report
    _print_audit_report(engine, summary)

    # Save metrics JSON
    metrics_path = "metrics.json"
    with open(metrics_path, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"\n[SAVED] Metrics → {metrics_path}")

    return summary


def _get_demo_agents() -> List[Tuple[str, str, str, str, bool, str]]:
    """Generate synthetic agent data for demo."""
    return [
        (
            "agent-1",
            "Security Code Reviewer",
            """<role>
You are a security-focused code reviewer specialized in identifying vulnerabilities
in TypeScript/Next.js applications against OWASP Top 10 standards.
</role>

<output_format>
Return a JSON object with:
- verdict: "PASS" | "REVIEW" | "BLOCK"
- severity: "critical" | "high" | "medium" | "low"
- findings: Array of {issue, cwe, location, remediation}
- summary: Brief security posture assessment
</output_format>

<constraints>
- Never approve code without examining all user inputs
- Always check for authentication/authorization flaws
- Flag any hardcoded secrets or credentials
- Verify SQL injection protections with parameterized queries
- Check CORS and CSP headers in Next.js middleware
</constraints>

```json
{
  "verdict": "string",
  "severity": "string",
  "findings": [{"issue": "string", "cwe": "int", "location": "string"}],
  "summary": "string"
}
```

<examples>
Example input: "Review this Next.js login route"
Example output: {"verdict": "REVIEW", "severity": "high", "findings": [...]}
</examples>

<failure_modes>
1. Input is empty or not code: Respond with verdict="PASS" and summary="No code detected"
2. Code syntax is invalid: Return verdict="REVIEW" with message about parse error
3. Out of scope (non-code text): Politely redirect to actual code
</failure_modes>

<verification>
Validation criteria:
- Each finding must cite a specific CWE number
- Location must point to actual line of code
- Remediation must be actionable and specific
</verification>

Phase 1: Parse code structure
Phase 2: Identify input vectors
Phase 3: Check authentication/authorization
Phase 4: Verify data validation
Phase 5: Assess cryptography and secrets
Phase 6: Output verdict

Hard rules:
- NEVER approve code without input validation
- ALWAYS flag hardcoded credentials
- MUST verify authentication on all protected routes
""",
            "claude-3-5-sonnet",
            False,
            "2025-01-15T10:00:00Z",
        ),
        (
            "agent-2",
            "TypeScript Linter",
            """You help with TypeScript code formatting.""",
            "deepseek-chat",
            True,
            "2025-02-01T14:30:00Z",
        ),
        (
            "agent-3",
            "API Documentation",
            """<role>
You are an API documentation specialist who transforms code into OpenAPI 3.1 specifications.
</role>

<constraints>
- Always use components/schemas for reusable types
- Validate endpoint paths match actual code
- Include rate limiting headers
- Document all error responses with status codes
</constraints>

<output_format>
Generate valid OpenAPI 3.1 YAML with proper schema definitions.
</output_format>

```json
{
  "openapi": "3.1.0",
  "paths": {},
  "components": {}
}
```

<examples>
Input: Express POST /users endpoint
Output: Full OpenAPI spec with request/response schemas
</examples>

Failure modes:
- Missing endpoint code: Ask for the route file
- Ambiguous parameter types: Request type annotations
- Invalid schema: Validate against OpenAPI spec

Verification: Ensure all refs are resolvable and schemas are valid.

Steps:
1. Extract endpoints
2. Build schemas
3. Document parameters
4. Define responses
5. Add examples

Hard rules:
- Never use additionalProperties without explicit mention
- Always include error responses
- Must validate request/response examples
""",
            "deepseek-chat",
            False,
            "2025-02-10T09:15:00Z",
        ),
        (
            "agent-4",
            "Database Migration Advisor",
            """<role>
PostgreSQL migration and schema evolution expert for large-scale applications.
</role>

<constraints>
- Never use DDL without verification of backward compatibility
- Always test migrations on staging first
- Ensure zero-downtime deployment strategy
- Check for indexes on foreign keys
</constraints>

<output_format>
```json
{
  "migration_strategy": "string",
  "phases": [],
  "rollback_plan": "string",
  "risk_level": "low|medium|high"
}
```
</output_format>

<examples>
Adding a NOT NULL column to large table:
Phase 1: Create column as nullable with default
Phase 2: Backfill existing rows
Phase 3: Add NOT NULL constraint
</examples>

<failure_modes>
Missing schema definition: Request current schema
Ambiguous requirements: Ask clarifying questions before proposing
Out of scope: Redirect to DBA if architecture changes needed
</failure_modes>

<verification>
Every migration must include:
- Estimated execution time
- Storage impact calculation
- Rollback procedure
</verification>

Decomposed approach:
Step 1: Analyze current schema
Step 2: Identify impact zones
Step 3: Design phases
Step 4: Plan rollback
Step 5: Generate SQL

Hard rules:
- NEVER drop columns without backup
- ALWAYS test on staging replica
- MUST have rollback procedure
- NEVER run DDL during business hours without approval
""",
            "claude-3-5-sonnet",
            False,
            "2025-02-05T16:45:00Z",
        ),
    ]


def _print_audit_report(engine: AuditEngine, summary: Dict[str, Any]) -> None:
    """Print formatted audit report to console."""
    print("AUDIT SUMMARY — {}".format(summary["audit_date"].split("T")[0]))
    print("-" * 70)
    print(f"Total agents: {summary['total_agents']}")
    print(f"✅ Enterprise quality (8+/10): {summary['enterprise_count']}")
    print(f"🔧 Needs improvement (6-7/10): {summary['needs_improvement_count']}")
    print(f"⚠️  Critical gaps (<6/10): {summary['critical_count']}")
    print(f"🗑️  Delete candidates: {summary['delete_candidates']}")
    print()

    print("DIMENSION COVERAGE ACROSS ALL AGENTS")
    print("-" * 70)
    dimensions = [
        "role", "output_format", "constraints", "json_schema", "examples",
        "failure_modes", "verification", "xml_depth", "decomposition", "hard_rules"
    ]
    for i, dim in enumerate(dimensions, 1):
        cov = summary["dimension_coverage"][dim]
        pct = cov["percentage"]
        print(
            f"  {i:2d}. {dim:15s}: {cov['count']:2d}/{cov['total']} agents ({pct:5.1f}%)"
        )
    print()

    print("PROMPT LENGTH STATISTICS")
    print("-" * 70)
    print(f"Average: {summary['average_prompt_length']:,} chars")
    print(f"Range: {summary['min_prompt_length']:,}–{summary['max_prompt_length']:,} chars")
    print(f"Target: ≥ {AuditEngine.MIN_PROMPT_LENGTH:,} chars")
    print()

    if summary["enterprise_list"]:
        print("ENTERPRISE QUALITY AGENTS (8+/10)")
        print("-" * 70)
        for agent in summary["enterprise_list"]:
            print(f"  ✅ {agent['name']:30s} {agent['score']}/10  ({agent['length']} chars)")
        print()

    if summary["needs_improvement_list"]:
        print("NEEDS IMPROVEMENT (6-7/10)")
        print("-" * 70)
        for agent in summary["needs_improvement_list"]:
            missing_str = ", ".join(agent["missing"])
            print(f"  🔧 {agent['name']:30s} {agent['score']}/10")
            print(f"     Missing: {missing_str}")
        print()

    if summary["critical_list"]:
        print("CRITICAL GAPS (<6/10)")
        print("-" * 70)
        for agent in summary["critical_list"]:
            missing_str = ", ".join(agent["missing"][:3])
            print(f"  ⚠️  {agent['name']:30s} {agent['score']}/10")
            print(f"     Missing: {missing_str}")
        print()

    if summary["delete_candidates_list"]:
        print("DELETE CANDIDATES (insufficient content)")
        print("-" * 70)
        for agent in summary["delete_candidates_list"]:
            print(f"  🗑️  {agent['name']:30s} ({agent['length']} chars)")
        print()

    print("PRE-DEPLOY QUALITY GATE")
    print("-" * 70)
    failing = summary["critical_count"] + summary["needs_improvement_count"]
    if failing == 0:
        print("✅ DEPLOY OK: All {} agents at 8+/10".format(summary["total_agents"]))
    else:
        print(f"❌ DEPLOY BLOCKED: {failing} agents below 8/10")
        print("   Fix these agents before deploying to production")


if __name__ == "__main__":
    main()
