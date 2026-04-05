#!/usr/bin/env python3
"""
Agent Audit & Scoring System
Comprehensive PostgreSQL auditor for agent-studio agents
Scoring logic: deterministic, rule-based health checks (0-100)
"""

import asyncio
import json
from datetime import datetime, timedelta
from typing import Any, TypedDict, Optional
import psycopg
from psycopg import AsyncConnection


class AuditMetrics(TypedDict):
    """Single agent audit metrics"""
    agentId: str
    name: str
    configScore: int  # Configuration health (0-100)
    usageScore: int   # Usage/activity health (0-100)
    knowledgeScore: int  # Knowledge base health (0-100)
    reliabilityScore: int  # Execution reliability (0-100)
    securityScore: int  # Security/auth health (0-100)
    overallScore: int  # Weighted average (0-100)
    urgencyLevel: str  # "CRITICAL", "HIGH", "MEDIUM", "LOW"
    findings: list[str]  # List of issues detected
    lastUpdated: str


class AuditConfig:
    """Configurable audit thresholds"""
    DAYS_INACTIVE_THRESHOLD = 30
    MIN_MEMORY_SIZE_MB = 0.1
    MAX_MODEL_TEMPERATURE = 1.0
    MIN_MODEL_TEMPERATURE = 0.0
    CRITICAL_SCORE_THRESHOLD = 30
    HIGH_SCORE_THRESHOLD = 50
    MEDIUM_SCORE_THRESHOLD = 70


async def connect_to_db(connection_string: str) -> AsyncConnection:
    """
    Establish async PostgreSQL connection
    Railway proxy endpoint: tramway.proxy.rlwy.net:54364
    """
    try:
        conn = await psycopg.AsyncConnection.connect(connection_string)
        await conn.execute("SELECT 1")  # Test connection
        return conn
    except Exception as e:
        print(f"ERROR: Database connection failed - {e}")
        raise


async def fetch_all_agents(conn: AsyncConnection) -> list[dict]:
    """Fetch all agents with basic metadata"""
    query = """
    SELECT
        id, name, description, userId, organizationId,
        createdAt, updatedAt, isPublic, category, tags,
        model, temperature, systemPrompt, eccEnabled,
        expectedDurationSeconds
    FROM "Agent"
    ORDER BY updatedAt DESC
    """
    async with conn.cursor(row_factory=dict) as cur:
        await cur.execute(query)
        return await cur.fetchall()


async def fetch_agent_flows(conn: AsyncConnection, agent_id: str) -> Optional[dict]:
    """Fetch flow data for an agent"""
    query = """
    SELECT
        id, content, activeVersionId, createdAt, updatedAt
    FROM "Flow"
    WHERE agentId = %s
    """
    async with conn.cursor(row_factory=dict) as cur:
        await cur.execute(query, (agent_id,))
        return await cur.fetchone()


async def fetch_knowledge_base(conn: AsyncConnection, agent_id: str) -> Optional[dict]:
    """Fetch knowledge base health metrics"""
    query = """
    SELECT
        id, name, totalChunks, totalTokens, createdAt, updatedAt
    FROM "KnowledgeBase"
    WHERE agentId = %s
    """
    async with conn.cursor(row_factory=dict) as cur:
        await cur.execute(query, (agent_id,))
        kb = await cur.fetchone()

        if not kb:
            return None

        # Fetch chunk count and vector embeddings
        chunks_query = """
        SELECT COUNT(*) as chunk_count,
               SUM(LENGTH(content)) as total_bytes
        FROM "KBChunk"
        WHERE knowledgeBaseId = %s
        """
        async with conn.cursor(row_factory=dict) as chunk_cur:
            await chunk_cur.execute(chunks_query, (kb['id'],))
            chunk_stats = await chunk_cur.fetchone()
            kb['chunks'] = chunk_stats

        return kb


async def fetch_conversations(conn: AsyncConnection, agent_id: str) -> dict:
    """Fetch conversation health metrics"""
    query = """
    SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN createdAt > NOW() - INTERVAL '7 days' THEN 1 END) as last_7d,
        COUNT(CASE WHEN createdAt > NOW() - INTERVAL '30 days' THEN 1 END) as last_30d
    FROM "Conversation"
    WHERE agentId = %s
    """
    async with conn.cursor(row_factory=dict) as cur:
        await cur.execute(query, (agent_id,))
        return await cur.fetchone()


async def fetch_analytics(conn: AsyncConnection, agent_id: str) -> dict:
    """Fetch execution/performance analytics"""
    query = """
    SELECT
        COUNT(*) as total_events,
        COUNT(CASE WHEN "timestamp" > NOW() - INTERVAL '7 days' THEN 1 END) as events_7d,
        AVG(CASE WHEN "type" = 'EXECUTION_TIME' THEN value END) as avg_execution_ms,
        MAX(CASE WHEN "type" = 'ERROR' THEN 1 ELSE 0 END) as has_errors,
        COUNT(CASE WHEN "type" = 'ERROR' THEN 1 END) as error_count
    FROM "AnalyticsEvent"
    WHERE agentId = %s
    """
    async with conn.cursor(row_factory=dict) as cur:
        await cur.execute(query, (agent_id,))
        return await cur.fetchone()


async def fetch_approvals(conn: AsyncConnection, agent_id: str) -> dict:
    """Fetch human approval request stats"""
    query = """
    SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'EXPIRED' THEN 1 END) as expired
    FROM "HumanApprovalRequest"
    WHERE agentId = %s
    """
    async with conn.cursor(row_factory=dict) as cur:
        await cur.execute(query, (agent_id,))
        return await cur.fetchone()


async def fetch_eval_health(conn: AsyncConnection, agent_id: str) -> dict:
    """Fetch eval suite and test results"""
    query = """
    SELECT
        COUNT(DISTINCT s.id) as suite_count,
        COUNT(DISTINCT t.id) as test_case_count,
        SUM(CASE WHEN r.status = 'PASSED' THEN 1 ELSE 0 END) as passed_runs,
        SUM(CASE WHEN r.status = 'FAILED' THEN 1 ELSE 0 END) as failed_runs,
        AVG(r.score) as avg_test_score
    FROM "EvalSuite" s
    LEFT JOIN "EvalTestCase" t ON s.id = t.suiteId
    LEFT JOIN "EvalRun" r ON s.id = r.suiteId
    WHERE s.agentId = %s
    """
    async with conn.cursor(row_factory=dict) as cur:
        await cur.execute(query, (agent_id,))
        return await cur.fetchone()


async def score_configuration(agent: dict, flow: Optional[dict]) -> tuple[int, list[str]]:
    """
    Score agent configuration (0-100)
    Checks: model validity, temperature range, systemPrompt, flow exists
    """
    score = 100
    findings = []

    if not agent['name'] or len(agent['name'].strip()) == 0:
        score -= 25
        findings.append("Agent name is empty or whitespace")

    if not agent['systemPrompt'] or len(agent['systemPrompt'].strip()) < 20:
        score -= 15
        findings.append("System prompt missing or too short (<20 chars)")

    if agent['temperature'] is not None:
        if agent['temperature'] < 0 or agent['temperature'] > 2:
            score -= 20
            findings.append(f"Temperature {agent['temperature']} outside valid range [0-2]")

    if not flow:
        score -= 30
        findings.append("No flow defined for agent")
    elif not flow.get('content'):
        score -= 25
        findings.append("Flow exists but has no content/nodes")

    if agent['expectedDurationSeconds']:
        if agent['expectedDurationSeconds'] < 5 or agent['expectedDurationSeconds'] > 600:
            score -= 10
            findings.append(f"Expected duration {agent['expectedDurationSeconds']}s outside range [5-600]")

    return max(0, score), findings


async def score_usage(agent: dict, conversations: dict, analytics: dict) -> tuple[int, list[str]]:
    """
    Score agent usage/activity (0-100)
    Checks: recent activity, conversation volume, error rates
    """
    score = 100
    findings = []

    days_since_update = (datetime.now(agent['updatedAt'].tzinfo) - agent['updatedAt']).days
    if days_since_update > AuditConfig.DAYS_INACTIVE_THRESHOLD:
        score -= 40
        findings.append(f"No updates in {days_since_update} days (threshold: {AuditConfig.DAYS_INACTIVE_THRESHOLD})")
    elif days_since_update > 14:
        score -= 20
        findings.append(f"Last updated {days_since_update} days ago (less than 2 weeks)")

    conv_total = conversations.get('total') or 0
    if conv_total == 0:
        score -= 30
        findings.append("No conversations recorded")
    elif conv_total < 5:
        score -= 15
        findings.append(f"Very low usage: only {conv_total} conversations")

    last_7d = conversations.get('last_7d') or 0
    if last_7d == 0:
        score -= 25
        findings.append("No activity in last 7 days")

    analytics_events = analytics.get('total_events') or 0
    error_count = analytics.get('error_count') or 0
    if analytics_events > 0 and error_count > 0:
        error_rate = error_count / analytics_events
        if error_rate > 0.1:
            score -= 20
            findings.append(f"High error rate: {error_rate*100:.1f}% ({error_count}/{analytics_events})")

    return max(0, score), findings


async def score_knowledge_base(kb: Optional[dict]) -> tuple[int, list[str]]:
    """
    Score knowledge base health (0-100)
    Checks: KB exists, has chunks, embeddings are current
    """
    score = 100
    findings = []

    if not kb:
        score = 50  # KB is optional, but penalize missing
        findings.append("Knowledge base not configured")
        return score, findings

    chunks = kb.get('chunks', {})
    chunk_count = chunks.get('chunk_count') or 0
    total_bytes = chunks.get('total_bytes') or 0

    if chunk_count == 0:
        score -= 40
        findings.append("No KB chunks ingested")
    elif chunk_count < 5:
        score -= 20
        findings.append(f"Very few chunks ({chunk_count}), KB may be incomplete")

    kb_size_mb = total_bytes / (1024 * 1024) if total_bytes else 0
    if kb_size_mb < AuditConfig.MIN_MEMORY_SIZE_MB and chunk_count > 0:
        score -= 10
        findings.append(f"KB very small ({kb_size_mb:.2f} MB)")

    days_since_kb_update = (datetime.now(kb['updatedAt'].tzinfo) - kb['updatedAt']).days
    if days_since_kb_update > 90:
        score -= 15
        findings.append(f"KB not updated in {days_since_kb_update} days")

    return max(0, score), findings


async def score_reliability(analytics: dict, approvals: dict, evals: dict) -> tuple[int, list[str]]:
    """
    Score execution reliability (0-100)
    Checks: error rates, approval queue, eval coverage
    """
    score = 100
    findings = []

    error_count = analytics.get('error_count') or 0
    events_7d = analytics.get('events_7d') or 0
    if events_7d > 0:
        recent_error_rate = error_count / events_7d
        if recent_error_rate > 0.15:
            score -= 30
            findings.append(f"Recent error rate too high: {recent_error_rate*100:.1f}%")

    pending_approvals = approvals.get('pending') or 0
    if pending_approvals > 10:
        score -= 20
        findings.append(f"{pending_approvals} pending approvals (potential bottleneck)")

    expired_approvals = approvals.get('expired') or 0
    if expired_approvals > 5:
        score -= 15
        findings.append(f"{expired_approvals} expired approval requests")

    suite_count = evals.get('suite_count') or 0
    if suite_count == 0:
        score -= 25
        findings.append("No eval suites defined for testing")

    failed_runs = evals.get('failed_runs') or 0
    if failed_runs > 0:
        score -= min(20, failed_runs * 2)
        findings.append(f"{failed_runs} failed eval runs")

    return max(0, score), findings


async def score_security(agent: dict) -> tuple[int, list[str]]:
    """
    Score security posture (0-100)
    Checks: public exposure, eccEnabled, API key management
    """
    score = 100
    findings = []

    if agent['isPublic']:
        score -= 30
        findings.append("Agent is public (consider restricting access)")

    if not agent['userId']:
        score -= 20
        findings.append("Agent has no owner (orphaned)")

    if agent['eccEnabled']:
        score += 5  # Bonus for ECC security features enabled

    # Check for hardcoded secrets in system prompt (basic scan)
    prompt = agent.get('systemPrompt') or ""
    secret_patterns = ['api_key', 'password', 'secret', 'token', '===']
    for pattern in secret_patterns:
        if pattern.lower() in prompt.lower():
            score -= 15
            findings.append(f"Possible hardcoded secret detected in system prompt ({pattern})")
            break

    return max(0, score), findings


async def calculate_overall_score(
    config_score: int,
    usage_score: int,
    knowledge_score: int,
    reliability_score: int,
    security_score: int
) -> int:
    """
    Calculate weighted overall score
    Weights: config=25%, usage=25%, knowledge=20%, reliability=20%, security=10%
    """
    return int(
        config_score * 0.25 +
        usage_score * 0.25 +
        knowledge_score * 0.20 +
        reliability_score * 0.20 +
        security_score * 0.10
    )


def determine_urgency(overall_score: int) -> str:
    """Map score to urgency level"""
    if overall_score < AuditConfig.CRITICAL_SCORE_THRESHOLD:
        return "CRITICAL"
    elif overall_score < AuditConfig.HIGH_SCORE_THRESHOLD:
        return "HIGH"
    elif overall_score < AuditConfig.MEDIUM_SCORE_THRESHOLD:
        return "MEDIUM"
    return "LOW"


async def audit_agent(conn: AsyncConnection, agent: dict) -> AuditMetrics:
    """
    Execute full audit for a single agent
    Parallel fetches + sequential scoring
    """
    # Parallel data fetches
    flow_task = fetch_agent_flows(conn, agent['id'])
    kb_task = fetch_knowledge_base(conn, agent['id'])
    conv_task = fetch_conversations(conn, agent['id'])
    analytics_task = fetch_analytics(conn, agent['id'])
    approvals_task = fetch_approvals(conn, agent['id'])
    evals_task = fetch_eval_health(conn, agent['id'])

    flow, kb, conv, analytics, approvals, evals = await asyncio.gather(
        flow_task, kb_task, conv_task, analytics_task, approvals_task, evals_task
    )

    # Sequential scoring
    config_score, config_findings = await score_configuration(agent, flow)
    usage_score, usage_findings = await score_usage(agent, conv or {}, analytics or {})
    knowledge_score, kb_findings = await score_knowledge_base(kb)
    reliability_score, rel_findings = await score_reliability(analytics or {}, approvals or {}, evals or {})
    security_score, sec_findings = await score_security(agent)

    overall_score = await calculate_overall_score(
        config_score, usage_score, knowledge_score, reliability_score, security_score
    )
    urgency = determine_urgency(overall_score)

    all_findings = (
        config_findings + usage_findings + kb_findings + rel_findings + sec_findings
    )

    return AuditMetrics(
        agentId=agent['id'],
        name=agent['name'],
        configScore=config_score,
        usageScore=usage_score,
        knowledgeScore=knowledge_score,
        reliabilityScore=reliability_score,
        securityScore=security_score,
        overallScore=overall_score,
        urgencyLevel=urgency,
        findings=all_findings,
        lastUpdated=datetime.now(datetime.now().astimezone().tzinfo).isoformat()
    )


async def run_full_audit(connection_string: str) -> list[AuditMetrics]:
    """
    Main audit orchestrator
    Connects, fetches all agents, audits in parallel batches
    """
    print("Starting agent audit...")
    print(f"Connection: {connection_string.split('@')[1] if '@' in connection_string else 'hidden'}")

    conn = await connect_to_db(connection_string)

    try:
        agents = await fetch_all_agents(conn)
        print(f"Found {len(agents)} agents to audit")

        results = []
        batch_size = 10  # Process 10 agents in parallel

        for i in range(0, len(agents), batch_size):
            batch = agents[i:i+batch_size]
            print(f"Auditing batch {i//batch_size + 1}... ({len(batch)} agents)")

            batch_results = await asyncio.gather(
                *[audit_agent(conn, agent) for agent in batch],
                return_exceptions=True
            )

            for result in batch_results:
                if isinstance(result, Exception):
                    print(f"  ERROR during audit: {result}")
                else:
                    results.append(result)

        return results

    finally:
        await conn.aclose()


async def main(connection_string: str, output_dir: str = "."):
    """
    Entry point: run audit, generate reports
    """
    try:
        results = await run_full_audit(connection_string)

        # Sort by urgency (CRITICAL first)
        urgency_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
        results.sort(key=lambda r: (
            urgency_order.get(r['urgencyLevel'], 4),
            -r['overallScore']
        ))

        # Convert to serializable format
        results_json = [dict(r) for r in results]

        # Save metrics
        metrics_file = f"{output_dir}/metrics.json"
        with open(metrics_file, 'w') as f:
            json.dump(results_json, f, indent=2, default=str)

        print(f"\nAudit complete. Results saved to {metrics_file}")
        print(f"Total agents audited: {len(results)}")
        print("\nSummary by urgency level:")
        for level in ["CRITICAL", "HIGH", "MEDIUM", "LOW"]:
            count = sum(1 for r in results if r['urgencyLevel'] == level)
            print(f"  {level}: {count} agents")

        return results_json

    except Exception as e:
        print(f"ERROR: {e}")
        raise


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python audit_script.py <connection_string> [output_dir]")
        print("Example: python audit_script.py 'postgresql://user:pass@host:5432/db' .")
        sys.exit(1)

    conn_str = sys.argv[1]
    out_dir = sys.argv[2] if len(sys.argv) > 2 else "."

    asyncio.run(main(conn_str, out_dir))
