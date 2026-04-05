#!/usr/bin/env python3
"""
Agent Auditor — 2026 Enterprise Quality Audit Framework
Scores all agents in Railway PostgreSQL against 10-dimension rubric.
Connection string format: postgresql://postgres:PASSWORD@tramway.proxy.rlwy.net:PORT/railway
"""

import sys
import json
from datetime import datetime
from typing import TypedDict, Optional

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    print("ERROR: psycopg2 not installed. Install with: pip install psycopg2-binary")
    sys.exit(1)


# Type definitions
class DimensionScores(TypedDict):
    role: bool
    output_format: bool
    constraints: bool
    json_schema: bool
    examples: bool
    failure_modes: bool
    verification: bool
    xml_depth: bool
    decomposition: bool
    hard_rules: bool


class AgentScore(TypedDict):
    id: str
    name: str
    score: int
    category: str
    prompt_length: int
    prompt_preview: str
    dimensions: DimensionScores
    missing: list[str]
    created_at: str
    model: Optional[str]
    is_public: bool


class AuditMetrics(TypedDict):
    total_agents: int
    enterprise_quality: int
    needs_improvement: int
    critical_gaps: int
    delete_candidates: int
    avg_prompt_length: int
    shortest_prompt_name: str
    shortest_prompt_length: int
    dimension_coverage: dict[str, dict[str, float]]
    timestamp: str


DIMENSIONS = {
    'role': ('role', '<role>'),
    'output_format': ('output_format', '<output', '<output_format>'),
    'constraints': ('constraints', '<constraints>'),
    'json_schema': ('json_schema', '```json'),
    'examples': ('examples', '<example', 'example:'),
    'failure_modes': ('failure_modes', 'fail', 'handling', 'modes', 'graceful', '<failure_modes>'),
    'verification': ('verification', 'verif', 'validat'),
    'xml_depth': ('xml_depth', '<'),  # special handling: count > 4
    'decomposition': ('decomposition', 'phase', 'step', 'decompos'),
    'hard_rules': ('hard_rules', 'never', 'must not', 'always'),
}

DEPLOY_THRESHOLD = 8
MIN_PROMPT_LENGTH = 4000
DELETE_CANDIDATE_THRESHOLD = 100


def check_dimension(prompt: str, dimension_key: str) -> bool:
    """Check if prompt contains required dimension markers."""
    if not prompt:
        return False

    prompt_lower = prompt.lower()

    # Special handling for xml_depth
    if dimension_key == 'xml_depth':
        # Count opening XML tags: require at least 4
        return prompt.count('<') >= 4

    # For other dimensions, check if ANY marker is present
    markers = DIMENSIONS[dimension_key][1:]  # skip first element (name)
    for marker in markers:
        if marker.lower() in prompt_lower:
            return True

    return False


def score_agent(agent_id: str, name: str, prompt: str, model: Optional[str],
                is_public: bool, created_at: str) -> AgentScore:
    """Score a single agent on the 10-dimension rubric."""

    prompt_length = len(prompt) if prompt else 0
    prompt_preview = (prompt[:80] + '...') if len(prompt) > 80 else (prompt or '(empty)')

    # Score all dimensions
    dimensions: DimensionScores = {
        'role': check_dimension(prompt, 'role'),
        'output_format': check_dimension(prompt, 'output_format'),
        'constraints': check_dimension(prompt, 'constraints'),
        'json_schema': check_dimension(prompt, 'json_schema'),
        'examples': check_dimension(prompt, 'examples'),
        'failure_modes': check_dimension(prompt, 'failure_modes'),
        'verification': check_dimension(prompt, 'verification'),
        'xml_depth': check_dimension(prompt, 'xml_depth'),
        'decomposition': check_dimension(prompt, 'decomposition'),
        'hard_rules': check_dimension(prompt, 'hard_rules'),
    }

    score = sum(dimensions.values())

    # Determine category
    if prompt_length <= DELETE_CANDIDATE_THRESHOLD or prompt == "You are a helpful assistant.":
        category = "DELETE_CANDIDATE"
    elif score >= DEPLOY_THRESHOLD:
        category = "ENTERPRISE_QUALITY"
    elif score >= 6:
        category = "NEEDS_IMPROVEMENT"
    else:
        category = "CRITICAL_GAP"

    # Flag if prompt too short (even if score looks good)
    if prompt_length < MIN_PROMPT_LENGTH and category != "DELETE_CANDIDATE":
        if category == "ENTERPRISE_QUALITY":
            category = "NEEDS_IMPROVEMENT"  # downgrade due to length

    missing = [k for k, v in dimensions.items() if not v]

    return {
        'id': agent_id,
        'name': name,
        'score': score,
        'category': category,
        'prompt_length': prompt_length,
        'prompt_preview': prompt_preview,
        'dimensions': dimensions,
        'missing': missing,
        'created_at': created_at,
        'model': model,
        'is_public': is_public,
    }


def connect_and_fetch_agents(connection_string: str) -> list[AgentScore]:
    """Connect to Railway PostgreSQL and fetch all agents."""
    try:
        conn = psycopg2.connect(connection_string)
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # Fetch all agents with their system prompts
        cur.execute('''
            SELECT
                id,
                name,
                "systemPrompt" as system_prompt,
                model,
                "isPublic" as is_public,
                "createdAt" as created_at
            FROM "Agent"
            ORDER BY name
        ''')

        rows = cur.fetchall()
        conn.close()

        # Score each agent
        scores = []
        for row in rows:
            score = score_agent(
                agent_id=row['id'],
                name=row['name'],
                prompt=row['system_prompt'] or '',
                model=row['model'],
                is_public=row['is_public'],
                created_at=row['created_at'].isoformat() if row['created_at'] else 'unknown',
            )
            scores.append(score)

        return scores

    except psycopg2.OperationalError as e:
        print(f"ERROR: Could not connect to Railway PostgreSQL")
        print(f"Connection string: {connection_string}")
        print(f"Details: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)


def compute_metrics(scores: list[AgentScore]) -> AuditMetrics:
    """Compute summary metrics from scored agents."""

    enterprise = [s for s in scores if s['category'] == 'ENTERPRISE_QUALITY']
    needs_improvement = [s for s in scores if s['category'] == 'NEEDS_IMPROVEMENT']
    critical = [s for s in scores if s['category'] == 'CRITICAL_GAP']
    delete = [s for s in scores if s['category'] == 'DELETE_CANDIDATE']

    prompt_lengths = [s['prompt_length'] for s in scores if s['prompt_length'] > 0]
    avg_length = int(sum(prompt_lengths) / len(prompt_lengths)) if prompt_lengths else 0

    shortest = min(scores, key=lambda s: s['prompt_length'])

    # Compute dimension coverage across all agents
    dimension_coverage: dict[str, dict[str, float]] = {}
    for dim_key in DIMENSIONS.keys():
        passes = sum(1 for s in scores if s['dimensions'][dim_key])
        total = len(scores)
        pct = (passes / total * 100) if total > 0 else 0
        dimension_coverage[dim_key] = {
            'passes': passes,
            'total': total,
            'percentage': round(pct, 1),
        }

    return {
        'total_agents': len(scores),
        'enterprise_quality': len(enterprise),
        'needs_improvement': len(needs_improvement),
        'critical_gaps': len(critical),
        'delete_candidates': len(delete),
        'avg_prompt_length': avg_length,
        'shortest_prompt_name': shortest['name'],
        'shortest_prompt_length': shortest['prompt_length'],
        'dimension_coverage': dimension_coverage,
        'timestamp': datetime.now().isoformat(),
    }


def generate_audit_report(scores: list[AgentScore], metrics: AuditMetrics) -> str:
    """Generate a formatted audit report."""

    report = []
    report.append("=" * 80)
    report.append("AGENT AUDITOR — 2026 ENTERPRISE QUALITY AUDIT")
    report.append(f"Report generated: {metrics['timestamp']}")
    report.append("=" * 80)
    report.append("")

    # Summary
    report.append("AUDIT SUMMARY")
    report.append("-" * 80)
    report.append(f"Total agents: {metrics['total_agents']}")
    report.append(f"✅ Enterprise quality (8+/10): {metrics['enterprise_quality']}")
    report.append(f"🔧 Needs improvement (6-7/10): {metrics['needs_improvement']}")
    report.append(f"⚠️  Critical gaps (<6/10): {metrics['critical_gaps']}")
    report.append(f"🗑️  Delete candidates: {metrics['delete_candidates']}")
    report.append("")
    report.append(f"Average prompt length: {metrics['avg_prompt_length']} chars")
    report.append(f"Shortest prompt: \"{metrics['shortest_prompt_name']}\" ({metrics['shortest_prompt_length']} chars)")
    report.append("")

    # Dimension coverage table
    report.append("DIMENSION COVERAGE (across all agents)")
    report.append("-" * 80)
    for dim_key in DIMENSIONS.keys():
        cov = metrics['dimension_coverage'][dim_key]
        bar_width = int(cov['percentage'] / 5)  # 0-20 chars
        bar = '█' * bar_width + '░' * (20 - bar_width)
        report.append(
            f"{dim_key:20s} {cov['passes']:3d}/{cov['total']:3d} ({cov['percentage']:5.1f}%) [{bar}]"
        )
    report.append("")

    # Delete candidates
    delete = [s for s in scores if s['category'] == 'DELETE_CANDIDATE']
    if delete:
        report.append("DELETE CANDIDATES (remove these agents)")
        report.append("-" * 80)
        for agent in sorted(delete, key=lambda a: a['prompt_length']):
            report.append(f"  • {agent['name']} ({agent['prompt_length']} chars)")
            report.append(f"    Preview: {agent['prompt_preview']}")
        report.append("")

    # Critical gaps
    critical = sorted(
        [s for s in scores if s['category'] == 'CRITICAL_GAP'],
        key=lambda s: s['score']
    )
    if critical:
        report.append("CRITICAL GAPS — <6/10 (rewrite required)")
        report.append("-" * 80)
        for agent in critical:
            report.append(f"  • {agent['name']} — {agent['score']}/10")
            report.append(f"    Missing: {', '.join(agent['missing'])}")
            report.append(f"    Length: {agent['prompt_length']} chars")
        report.append("")

    # Needs improvement
    needs_imp = sorted(
        [s for s in scores if s['category'] == 'NEEDS_IMPROVEMENT'],
        key=lambda s: s['score']
    )
    if needs_imp:
        report.append("NEEDS IMPROVEMENT — 6-7/10 (add sections)")
        report.append("-" * 80)
        for agent in needs_imp:
            report.append(f"  • {agent['name']} — {agent['score']}/10")
            report.append(f"    Missing: {', '.join(agent['missing'])}")
            report.append(f"    Length: {agent['prompt_length']} chars")
        report.append("")

    # Enterprise quality
    enterprise = sorted(
        [s for s in scores if s['category'] == 'ENTERPRISE_QUALITY'],
        key=lambda s: s['score'],
        reverse=True
    )
    if enterprise:
        report.append("ENTERPRISE QUALITY — 8+/10 (production ready)")
        report.append("-" * 80)
        for agent in enterprise[:10]:  # Show top 10
            report.append(f"  ✓ {agent['name']} — {agent['score']}/10")
        if len(enterprise) > 10:
            report.append(f"  ... and {len(enterprise) - 10} more")
        report.append("")

    # Pre-deploy gate
    report.append("PRE-DEPLOY QUALITY GATE")
    report.append("-" * 80)

    failing = [s for s in scores if s['category'] in ['CRITICAL_GAP', 'DELETE_CANDIDATE']]

    if failing:
        report.append(f"⛔ DEPLOY BLOCKED: {len(failing)} agent(s) below threshold")
        report.append("")
        for agent in failing[:5]:  # Show first 5
            report.append(f"  - {agent['name']}: {agent['score']}/10 (missing: {', '.join(agent['missing'][:3])})")
        if len(failing) > 5:
            report.append(f"  ... and {len(failing) - 5} more")
        report.append("")
        report.append("Recommendation: Fix agents above before deploying.")
    else:
        report.append("✅ DEPLOY OK: all agents at 8+/10")
        report.append("No blocking issues detected.")

    report.append("")
    report.append("=" * 80)

    return "\n".join(report)


def generate_improvement_templates(scores: list[AgentScore]) -> str:
    """Generate XML templates for improving low-scoring agents."""

    templates = []
    templates.append("=" * 80)
    templates.append("IMPROVEMENT TEMPLATES")
    templates.append("Add these sections to agents scoring below 8/10")
    templates.append("=" * 80)
    templates.append("")

    critical = [s for s in scores if s['category'] == 'CRITICAL_GAP']
    needs_imp = [s for s in scores if s['category'] == 'NEEDS_IMPROVEMENT']

    agents_to_improve = sorted(
        critical + needs_imp,
        key=lambda s: s['score']
    )

    for agent in agents_to_improve[:5]:  # Show first 5
        templates.append(f"AGENT: {agent['name']} (currently {agent['score']}/10)")
        templates.append("-" * 80)
        templates.append("")

        if 'role' in agent['missing']:
            templates.append("<role>")
            templates.append("You are the [Agent Name] — [specific expert identity].")
            templates.append("Your role is to [primary function] as part of [context/pipeline].")
            templates.append("You focus on [unique perspective/domain expertise].")
            templates.append("</role>")
            templates.append("")

        if 'output_format' in agent['missing']:
            templates.append("<output_format>")
            templates.append("Return a JSON object with:")
            templates.append("{")
            templates.append('  "verdict": "PASS" | "FAIL",')
            templates.append('  "confidence": 0.0-1.0,')
            templates.append('  "findings": [{ "type": "string", "severity": "high|medium|low" }],')
            templates.append('  "summary": "string"')
            templates.append("}")
            templates.append("</output_format>")
            templates.append("")

        if 'constraints' in agent['missing']:
            templates.append("<constraints>")
            templates.append("• NEVER: [explicit prohibition]")
            templates.append("• MUST: [mandatory behavior]")
            templates.append("• MAX: [performance ceiling]")
            templates.append("• TIMEOUT: [execution limit]")
            templates.append("</constraints>")
            templates.append("")

        if 'failure_modes' in agent['missing']:
            templates.append("<failure_modes>")
            templates.append("1. Input missing/malformed → Return null with error message")
            templates.append("2. Confidence too low (<0.5) → Return verdict='UNCERTAIN' with reasoning")
            templates.append("3. Out of scope → Return error with redirect to correct agent")
            templates.append("</failure_modes>")
            templates.append("")

        if 'examples' in agent['missing']:
            templates.append("<examples>")
            templates.append("Example 1: [input] → [expected output]")
            templates.append("Example 2: [input] → [expected output]")
            templates.append("</examples>")
            templates.append("")

        templates.append("")

    return "\n".join(templates)


def main():
    """Main entry point."""

    if len(sys.argv) < 2:
        print("Usage: python audit_script.py <railway_connection_string>")
        print("")
        print("Example:")
        print('  python audit_script.py "postgresql://postgres:PASSWORD@tramway.proxy.rlwy.net:54364/railway"')
        sys.exit(1)

    connection_string = sys.argv[1]

    print("Connecting to Railway PostgreSQL...")
    print(f"Connection string: {connection_string.split('@')[0]}@***")
    print("")

    # Fetch and score agents
    scores = connect_and_fetch_agents(connection_string)
    print(f"Found {len(scores)} agents in Railway PostgreSQL.")
    print("")

    # Compute metrics
    metrics = compute_metrics(scores)

    # Generate report
    report = generate_audit_report(scores, metrics)
    print(report)

    # Generate improvement templates
    templates = generate_improvement_templates(scores)

    # Output to files (in production)
    print("\nOutput files would be saved to:")
    print("  • audit_output.md (report)")
    print("  • improvement_templates.txt (XML sections)")
    print("  • metrics.json (structured data)")

    return scores, metrics, report, templates


if __name__ == "__main__":
    main()
