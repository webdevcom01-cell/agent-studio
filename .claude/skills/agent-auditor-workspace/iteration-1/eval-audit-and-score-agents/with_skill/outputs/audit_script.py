#!/usr/bin/env python3
"""
Agent Auditor — Enterprise Quality Audit Framework
Audit all agents in Railway PostgreSQL against 2026 standards (10-dimension rubric).
Usage: python audit_script.py <railway_url>
Example: python audit_script.py "postgresql://postgres:testpass@tramway.proxy.rlwy.net:54364/railway"
"""

import sys
import json
import re
from datetime import datetime
from typing import TypedDict, Optional
import psycopg2
from psycopg2.extras import DictCursor

# ============================================================================
# TYPE DEFINITIONS
# ============================================================================

class AgentScore(TypedDict):
    """Scoring result for a single agent."""
    name: str
    id: str
    model: str
    is_public: bool
    created_at: str
    prompt_length: int
    score: int  # 0-10
    dimensions: dict[str, bool]  # dimension name -> present
    missing_dimensions: list[str]
    is_delete_candidate: bool
    issues: list[str]


class AuditReport(TypedDict):
    """Final audit report structure."""
    audit_date: str
    total_agents: int
    enterprise_quality: list[str]  # agent names
    needs_improvement: list[str]  # agent names
    critical_gaps: list[str]  # agent names
    delete_candidates: list[str]  # agent names
    scores: dict[str, AgentScore]
    summary: dict


# ============================================================================
# STEP 1: CONNECT & FETCH AGENTS
# ============================================================================

def connect_railway(connection_string: str) -> psycopg2.extensions.connection:
    """
    Connect to Railway PostgreSQL.
    """
    try:
        conn = psycopg2.connect(connection_string)
        print(f"✓ Connected to Railway PostgreSQL")
        return conn
    except psycopg2.Error as e:
        print(f"✗ Failed to connect to Railway: {e}")
        sys.exit(1)


def fetch_all_agents(conn: psycopg2.extensions.connection) -> list[dict]:
    """
    Fetch all agents with their system prompts, models, and metadata.
    """
    try:
        with conn.cursor(cursor_factory=DictCursor) as cur:
            cur.execute(
                '''
                SELECT
                    id,
                    name,
                    "systemPrompt",
                    model,
                    "isPublic",
                    "createdAt"
                FROM "Agent"
                ORDER BY name
                '''
            )
            agents = cur.fetchall()
        print(f"✓ Found {len(agents)} agents in Railway PostgreSQL")
        return agents
    except psycopg2.Error as e:
        print(f"✗ Failed to fetch agents: {e}")
        sys.exit(1)


# ============================================================================
# STEP 2: SCORING LOGIC (10-DIMENSION RUBRIC)
# ============================================================================

DIMENSIONS = [
    ("role_block", "<role>"),
    ("output_format", ["<output_format>", "<output>"]),
    ("constraints", "<constraints>"),
    ("json_schema", "```json"),
    ("examples", ["<example", "example:"]),
    ("failure_modes", ["fail", "handling", "graceful", "<failure_modes>"]),
    ("verification", ["verif", "validat"]),
    ("xml_depth", None),  # Special: count XML tags
    ("phased_approach", ["phase", "step", "decompos"]),
    ("hard_rules", ["never", "must not", "always"]),
]


def score_agent(agent: dict) -> AgentScore:
    """
    Score a single agent on the 10-dimension rubric.
    Returns AgentScore with dimensions checked and missing list.
    """
    name = agent["name"]
    agent_id = agent["id"]
    prompt = agent.get("systemPrompt") or ""
    model = agent.get("model") or "unknown"
    is_public = agent.get("isPublic", False)
    created_at = agent.get("createdAt", "unknown")

    prompt_length = len(prompt)

    # Check for delete candidate early
    is_delete_candidate = (
        prompt_length <= 100 or
        prompt.strip() == "You are a helpful assistant."
    )

    dimensions_result = {}
    score = 0

    # Dimension 1: <role> block
    has_role = "<role>" in prompt
    dimensions_result["role_block"] = has_role
    if has_role:
        score += 1

    # Dimension 2: <output_format> or <output>
    has_output_format = any(tag in prompt for tag in ["<output_format>", "<output>"])
    dimensions_result["output_format"] = has_output_format
    if has_output_format:
        score += 1

    # Dimension 3: <constraints>
    has_constraints = "<constraints>" in prompt
    dimensions_result["constraints"] = has_constraints
    if has_constraints:
        score += 1

    # Dimension 4: JSON schema
    has_json_schema = "```json" in prompt
    dimensions_result["json_schema"] = has_json_schema
    if has_json_schema:
        score += 1

    # Dimension 5: Examples
    has_examples = any(keyword in prompt.lower() for keyword in ["<example", "example:"])
    dimensions_result["examples"] = has_examples
    if has_examples:
        score += 1

    # Dimension 6: Failure modes
    has_failure_modes = any(
        keyword in prompt.lower()
        for keyword in ["fail", "handling", "graceful", "<failure_modes>"]
    )
    dimensions_result["failure_modes"] = has_failure_modes
    if has_failure_modes:
        score += 1

    # Dimension 7: Verification criteria
    has_verification = any(
        keyword in prompt.lower()
        for keyword in ["verif", "validat"]
    )
    dimensions_result["verification"] = has_verification
    if has_verification:
        score += 1

    # Dimension 8: XML structure depth (at least 4 XML tags)
    xml_tags = len(re.findall(r'<\w+', prompt))
    has_xml_depth = xml_tags >= 4
    dimensions_result["xml_depth"] = has_xml_depth
    if has_xml_depth:
        score += 1

    # Dimension 9: Phased/decomposed approach
    has_phased = any(
        keyword in prompt.lower()
        for keyword in ["phase", "step", "decompos"]
    )
    dimensions_result["phased_approach"] = has_phased
    if has_phased:
        score += 1

    # Dimension 10: Hard rules (never/must/always)
    has_hard_rules = any(
        keyword in prompt.lower()
        for keyword in ["never", "must not", "always"]
    )
    dimensions_result["hard_rules"] = has_hard_rules
    if has_hard_rules:
        score += 1

    # Apply minimum length penalty
    if prompt_length < 4000:
        issues = [f"Prompt too short ({prompt_length} chars, min 4000)"]
    else:
        issues = []

    missing = [dim for dim, present in dimensions_result.items() if not present]

    return {
        "name": name,
        "id": agent_id,
        "model": model,
        "is_public": is_public,
        "created_at": str(created_at),
        "prompt_length": prompt_length,
        "score": score,
        "dimensions": dimensions_result,
        "missing_dimensions": missing,
        "is_delete_candidate": is_delete_candidate,
        "issues": issues,
    }


# ============================================================================
# STEP 3: CATEGORIZE & SUMMARIZE
# ============================================================================

def categorize_agents(scores: list[AgentScore]) -> dict:
    """
    Categorize agents by threshold (8+/10, 6-7/10, <6/10, delete).
    """
    enterprise_quality = []
    needs_improvement = []
    critical_gaps = []
    delete_candidates = []

    for score in scores:
        if score["is_delete_candidate"]:
            delete_candidates.append(score["name"])
        elif score["score"] >= 8:
            enterprise_quality.append(score["name"])
        elif score["score"] >= 6:
            needs_improvement.append(score["name"])
        else:
            critical_gaps.append(score["name"])

    return {
        "enterprise_quality": enterprise_quality,
        "needs_improvement": needs_improvement,
        "critical_gaps": critical_gaps,
        "delete_candidates": delete_candidates,
    }


def generate_summary(scores: list[AgentScore], categories: dict) -> dict:
    """
    Generate audit summary statistics.
    """
    prompt_lengths = [s["prompt_length"] for s in scores]

    return {
        "audit_date": datetime.now().isoformat(),
        "total_agents": len(scores),
        "enterprise_quality_count": len(categories["enterprise_quality"]),
        "needs_improvement_count": len(categories["needs_improvement"]),
        "critical_gaps_count": len(categories["critical_gaps"]),
        "delete_candidates_count": len(categories["delete_candidates"]),
        "average_prompt_length": round(sum(prompt_lengths) / len(prompt_lengths)) if prompt_lengths else 0,
        "min_prompt_length": min(prompt_lengths) if prompt_lengths else 0,
        "max_prompt_length": max(prompt_lengths) if prompt_lengths else 0,
        "average_score": round(sum(s["score"] for s in scores) / len(scores), 1) if scores else 0,
    }


# ============================================================================
# STEP 4: GENERATE IMPROVEMENTS
# ============================================================================

def generate_role_section(agent_name: str, prompt: str) -> str:
    """
    Generate a <role> section for agents that are missing it.
    """
    # Try to extract purpose from existing text
    purpose_hints = ["designed to", "helps", "assists", "creates", "analyzes", "reviews"]
    purpose = next((hint for hint in purpose_hints if hint.lower() in prompt.lower()), "provides")

    return f"""<role>
You are the {agent_name} — an expert agent specialized in enterprise-grade operations.
You {purpose} as part of the agent-studio AI agent ecosystem.
Your perspective is informed by 2026 standards for prompt engineering, enterprise quality, and reliable AI behavior.
</role>
"""


def generate_output_format_section(agent_name: str, is_user_facing: bool = False) -> str:
    """
    Generate an <output_format> section based on agent type.
    """
    if is_user_facing:
        return """<output_format>
Respond with structured markdown:
# Heading
- Key point
- Supporting detail
**Bold** for emphasis
Numbered lists for sequences
</output_format>
"""
    else:
        return """<output_format>
Output ONLY valid JSON in this exact schema:
```json
{
  "verdict": "PASS|FAIL|REVIEW_REQUIRED",
  "id": "agent_id",
  "findings": [
    {
      "dimension": "string",
      "status": "present|missing",
      "detail": "string"
    }
  ],
  "summary": "human-readable summary",
  "score": 0-10
}
```
</output_format>
"""


def generate_constraints_section(domain: str = "general") -> str:
    """
    Generate a <constraints> section based on domain.
    """
    base = """<constraints>
ALWAYS:
- Validate inputs before processing
- Return structured output in specified format
- Document any assumptions or limitations
- Fail gracefully with clear error messages

NEVER:
- Assume user intent without confirmation
- Return unformatted or raw text
- Proceed without required parameters
- Expose internal system details in errors
</constraints>
"""
    return base


def generate_failure_modes_section() -> str:
    """
    Generate a <failure_modes> section covering universal scenarios.
    """
    return """<failure_modes>
1. Input missing or malformed
   → Return structured error with required fields
   → Do not attempt to infer missing data
   → Ask user to provide required information

2. Confidence too low
   → Set verdict to REVIEW_REQUIRED
   → List specific areas needing clarification
   → Suggest next steps for resolution

3. Out of scope
   → Detect immediately
   → Redirect to appropriate agent/system
   → Provide context for handoff
</failure_modes>
"""


def generate_improvement_prompt(agent: dict, score: AgentScore) -> str:
    """
    Generate improvement guidance for a specific agent.
    """
    improvement = f"\n## Improvements for '{agent['name']}'\n"
    improvement += f"Current score: {score['score']}/10\n"
    improvement += f"Prompt length: {score['prompt_length']} chars\n"
    improvement += f"Missing dimensions: {', '.join(score['missing_dimensions']) or 'none'}\n\n"

    if "role_block" in score["missing_dimensions"]:
        improvement += "### Add <role> Section\n"
        improvement += generate_role_section(agent["name"], agent.get("systemPrompt", ""))
        improvement += "\n"

    if "output_format" in score["missing_dimensions"]:
        improvement += "### Add <output_format> Section\n"
        improvement += generate_output_format_section(agent["name"], agent.get("isPublic", False))
        improvement += "\n"

    if "constraints" in score["missing_dimensions"]:
        improvement += "### Add <constraints> Section\n"
        improvement += generate_constraints_section()
        improvement += "\n"

    if "failure_modes" in score["missing_dimensions"]:
        improvement += "### Add <failure_modes> Section\n"
        improvement += generate_failure_modes_section()
        improvement += "\n"

    return improvement


# ============================================================================
# STEP 5: GENERATE REPORT
# ============================================================================

def generate_audit_report(
    agents: list[dict],
    scores: list[AgentScore],
    categories: dict,
    summary: dict,
) -> str:
    """
    Generate the complete audit report in markdown.
    """
    report = f"""# Agent Auditor — Enterprise Quality Audit Report

**Audit Date:** {summary['audit_date']}
**Total Agents Audited:** {summary['total_agents']}

---

## Executive Summary

| Status | Count | Target |
|--------|-------|--------|
| ✅ Enterprise Quality (8+/10) | {summary['enterprise_quality_count']} | 100% |
| 🔧 Needs Improvement (6-7/10) | {summary['needs_improvement_count']} | 0 |
| ⚠️ Critical Gaps (<6/10) | {summary['critical_gaps_count']} | 0 |
| 🗑️ Delete Candidates | {summary['delete_candidates_count']} | 0 |

**Average Score:** {summary['average_score']}/10
**Average Prompt Length:** {summary['average_prompt_length']} characters
**Range:** {summary['min_prompt_length']} — {summary['max_prompt_length']} characters

---

## 10-Dimension Scoring Rubric

| # | Dimension | Definition | Enterprise Bar |
|---|-----------|-----------|-----------------|
| 1 | Role Block | `<role>` tag present | Required |
| 2 | Output Format | `<output_format>` or `<output>` tag | Required |
| 3 | Constraints | `<constraints>` tag present | Required |
| 4 | JSON Schema | ` \\`\\`\\`json ` block for structured output | Required |
| 5 | Examples | `<example>` or `example:` section | Strongly Recommended |
| 6 | Failure Modes | Defined error scenarios & handling | Required |
| 7 | Verification | Verification/validation criteria | Required |
| 8 | XML Depth | ≥4 XML tags total | Required |
| 9 | Phased Approach | Decomposed or step-by-step logic | Required |
| 10 | Hard Rules | `never`/`must`/`always` constraints | Required |

**Thresholds:**
- ✅ **8–10/10:** Enterprise ready (may have minor gaps in optional dimensions)
- 🔧 **6–7/10:** Needs improvements to core sections
- ⚠️ **<6/10:** Critical gaps — do not deploy
- 🗑️ **Delete:** Prompt ≤100 chars OR generic fallback

Agents with prompts <4000 characters are flagged regardless of dimension score.

---

## Detailed Scores

"""

    # Sort by score descending
    sorted_scores = sorted(scores, key=lambda x: x["score"], reverse=True)

    for score in sorted_scores:
        status_emoji = "✅" if score["score"] >= 8 else "🔧" if score["score"] >= 6 else "⚠️" if not score["is_delete_candidate"] else "🗑️"
        agent = next((a for a in agents if a["id"] == score["id"]), None)

        report += f"### {status_emoji} {score['name']}\n"
        report += f"**Score:** {score['score']}/10 | **Prompt Length:** {score['prompt_length']} chars | **Model:** {score['model']}\n\n"

        # Dimension breakdown
        report += "| Dimension | Status |\n|-----------|--------|\n"
        for dim_name, dim_present in score["dimensions"].items():
            status = "✓" if dim_present else "✗"
            report += f"| {dim_name.replace('_', ' ').title()} | {status} |\n"
        report += "\n"

        if score["is_delete_candidate"]:
            report += "**STATUS: DELETE CANDIDATE** — Prompt is too short or generic.\n\n"
        elif score["missing_dimensions"]:
            report += f"**Missing Dimensions:** {', '.join(score['missing_dimensions'])}\n\n"
        else:
            report += "**All dimensions present.** Minor improvements may still be possible.\n\n"

        if score["issues"]:
            report += f"**Issues:** {'; '.join(score['issues'])}\n\n"

        report += "---\n\n"

    # Priority Sections
    report += "## Priority Fixes\n\n"

    if categories["delete_candidates"]:
        report += f"### 🗑️ Delete Immediately ({len(categories['delete_candidates'])} agents)\n"
        for name in categories["delete_candidates"]:
            report += f"- {name}\n"
        report += "\n"

    if categories["critical_gaps"]:
        report += f"### ⚠️ Critical Gaps ({len(categories['critical_gaps'])} agents)\n"
        report += "These agents have <6/10 score and are not production-ready:\n"
        for name in categories["critical_gaps"]:
            score_data = next((s for s in scores if s["name"] == name), None)
            if score_data:
                report += f"- **{name}** ({score_data['score']}/10) — Missing: {', '.join(score_data['missing_dimensions'][:3])}\n"
        report += "\n"

    if categories["needs_improvement"]:
        report += f"### 🔧 Needs Improvement ({len(categories['needs_improvement'])} agents)\n"
        report += "These agents have 6-7/10 score:\n"
        for name in categories["needs_improvement"]:
            score_data = next((s for s in scores if s["name"] == name), None)
            if score_data:
                report += f"- **{name}** ({score_data['score']}/10) — Missing: {', '.join(score_data['missing_dimensions'][:3])}\n"
        report += "\n"

    report += f"### ✅ Enterprise Quality ({len(categories['enterprise_quality'])} agents)\n"
    if categories["enterprise_quality"]:
        report += "These agents meet the 8+/10 bar:\n"
        for name in categories["enterprise_quality"]:
            score_data = next((s for s in scores if s["name"] == name), None)
            if score_data:
                report += f"- **{name}** ({score_data['score']}/10)\n"
    else:
        report += "No agents currently meet the enterprise quality bar.\n"
    report += "\n"

    # Improvement Sections
    report += "## Recommended Improvements\n\n"

    improvement_agents = [s for s in scores if s["score"] < 8 and not s["is_delete_candidate"]]
    for score_data in improvement_agents[:5]:  # Show top 5
        agent = next((a for a in agents if a["id"] == score_data["id"]), None)
        if agent:
            report += generate_improvement_prompt(agent, score_data)

    if len(improvement_agents) > 5:
        report += f"\n(+ {len(improvement_agents) - 5} more agents with similar issues)\n"

    report += "\n---\n\n"
    report += "## Next Steps\n\n"
    report += "1. **Delete Candidates:** Remove agents with scores below minimum threshold\n"
    report += "2. **Critical Gaps:** Rebuild system prompts using the templates above\n"
    report += "3. **Needs Improvement:** Add missing sections (minimal surface principle)\n"
    report += "4. **Re-audit:** Run this script again after changes to confirm improvements\n"
    report += "5. **Deploy:** Only deploy agents with 8+/10 scores to production\n"

    return report


# ============================================================================
# MAIN EXECUTION
# ============================================================================

def main():
    if len(sys.argv) < 2:
        print("Usage: python audit_script.py <railway_url>")
        print("Example: python audit_script.py 'postgresql://postgres:testpass@tramway.proxy.rlwy.net:54364/railway'")
        sys.exit(1)

    railway_url = sys.argv[1]

    print("\n" + "=" * 70)
    print("AGENT AUDITOR — ENTERPRISE QUALITY AUDIT")
    print("=" * 70 + "\n")

    # Step 1: Connect
    conn = connect_railway(railway_url)
    agents = fetch_all_agents(conn)
    conn.close()

    # Step 2: Score all agents
    print("\nScoring agents...")
    scores = [score_agent(agent) for agent in agents]

    # Step 3: Categorize
    print("Categorizing results...")
    categories = categorize_agents(scores)
    summary = generate_summary(scores, categories)

    # Print console summary
    print("\n" + "-" * 70)
    print("AUDIT SUMMARY")
    print("-" * 70)
    print(f"✅ Enterprise quality (8+/10): {summary['enterprise_quality_count']}/{summary['total_agents']}")
    print(f"🔧 Needs improvement (6-7/10): {summary['needs_improvement_count']}/{summary['total_agents']}")
    print(f"⚠️ Critical gaps (<6/10): {summary['critical_gaps_count']}/{summary['total_agents']}")
    print(f"🗑️ Delete candidates: {summary['delete_candidates_count']}/{summary['total_agents']}")
    print(f"\nAverage score: {summary['average_score']}/10")
    print(f"Average prompt length: {summary['average_prompt_length']} chars")

    # Step 4-5: Generate report
    print("\nGenerating detailed report...")
    report = generate_audit_report(agents, scores, categories, summary)

    # Return results for output
    return {
        "report": report,
        "summary": summary,
        "scores": scores,
        "categories": categories,
    }


if __name__ == "__main__":
    results = main()
    print("\n✓ Audit complete!")
