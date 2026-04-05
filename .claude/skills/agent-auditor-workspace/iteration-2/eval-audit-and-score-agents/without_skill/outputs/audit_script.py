#!/usr/bin/env python3
"""
Agent Studio Audit & Scoring System

Comprehensive audit for all agents in Railway PostgreSQL database.
Evaluates configuration, runtime behavior, knowledge quality, and integration health.

Usage:
    python audit_script.py --db-url postgresql://... --output audit_output.md --metrics metrics.json
"""

import json
import sys
import argparse
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass, asdict
from enum import Enum
import hashlib
import psycopg2
import psycopg2.extras
from psycopg2 import sql

# ============================================================================
# CONFIGURATION & ENUMS
# ============================================================================

class SeverityLevel(Enum):
    """Issue severity classification."""
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    INFO = "INFO"


class AuditCategory(Enum):
    """Audit check categories."""
    CONFIGURATION = "Configuration"
    FLOW_INTEGRITY = "Flow Integrity"
    KNOWLEDGE_BASE = "Knowledge Base"
    INTEGRATION = "Integration"
    AUTHENTICATION = "Authentication"
    PERFORMANCE = "Performance"
    SECURITY = "Security"


@dataclass
class AuditIssue:
    """Single audit finding."""
    category: AuditCategory
    severity: SeverityLevel
    title: str
    description: str
    recommendation: str
    agent_id: str


@dataclass
class AgentMetrics:
    """Quantitative metrics for an agent."""
    agent_id: str
    agent_name: str
    created_at: str
    updated_at: str
    total_issues: int
    critical_issues: int
    high_issues: int
    configuration_score: float
    flow_score: float
    knowledge_score: float
    integration_score: float
    security_score: float
    overall_score: float
    needs_immediate_attention: bool


# ============================================================================
# DATABASE QUERIES
# ============================================================================

class DatabaseAuditor:
    """Handles database connection and audit queries."""

    def __init__(self, connection_string: str):
        """Initialize database connection."""
        self.connection_string = connection_string
        self.conn = None
        self.logger = self._setup_logger()

    def _setup_logger(self) -> logging.Logger:
        """Configure logging."""
        logger = logging.getLogger(__name__)
        handler = logging.StreamHandler(sys.stdout)
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        return logger

    def connect(self) -> bool:
        """Establish database connection."""
        try:
            self.conn = psycopg2.connect(self.connection_string)
            self.logger.info("Database connection established")
            return True
        except Exception as e:
            self.logger.error(f"Failed to connect to database: {e}")
            return False

    def disconnect(self):
        """Close database connection."""
        if self.conn:
            self.conn.close()
            self.logger.info("Database connection closed")

    def execute_query(self, query: str, params: tuple = ()) -> List[Dict]:
        """Execute query and return results as list of dicts."""
        if not self.conn:
            return []
        try:
            with self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(query, params)
                return cur.fetchall()
        except Exception as e:
            self.logger.error(f"Query execution error: {e}")
            return []

    def get_all_agents(self) -> List[Dict]:
        """Fetch all agents from database."""
        query = """
        SELECT 
            id, name, description, model, knowledge_base_id, 
            created_at, updated_at, enabled, is_public,
            max_iterations, temperature, top_p
        FROM agent
        ORDER BY updated_at DESC
        """
        return self.execute_query(query)

    def get_agent_flow(self, agent_id: str) -> Optional[Dict]:
        """Fetch agent flow configuration."""
        query = "SELECT id, content, version FROM flow WHERE agent_id = %s LIMIT 1"
        results = self.execute_query(query, (agent_id,))
        return results[0] if results else None

    def get_agent_knowledge_base(self, kb_id: str) -> Optional[Dict]:
        """Fetch knowledge base metadata."""
        query = """
        SELECT id, name, chunk_count, embedding_model, 
               search_strategy, created_at, updated_at
        FROM knowledge_base 
        WHERE id = %s
        """
        results = self.execute_query(query, (kb_id,))
        return results[0] if results else None

    def get_knowledge_base_stats(self, kb_id: str) -> Dict:
        """Get statistics for a knowledge base."""
        query = """
        SELECT 
            COUNT(*) as total_chunks,
            COUNT(DISTINCT document_id) as document_count,
            AVG(LENGTH(content)) as avg_chunk_size,
            MIN(created_at) as first_chunk_date,
            MAX(updated_at) as last_updated
        FROM knowledge_base_chunk
        WHERE knowledge_base_id = %s
        """
        results = self.execute_query(query, (kb_id,))
        return results[0] if results else {}

    def get_agent_conversations(self, agent_id: str, days: int = 30) -> List[Dict]:
        """Fetch recent conversations for an agent."""
        query = """
        SELECT id, user_id, created_at, message_count, duration_seconds
        FROM conversation
        WHERE agent_id = %s 
        AND created_at >= NOW() - INTERVAL '%s days'
        ORDER BY created_at DESC
        """
        return self.execute_query(query, (agent_id, days))

    def get_agent_errors(self, agent_id: str, days: int = 30) -> List[Dict]:
        """Fetch recent error logs for an agent."""
        query = """
        SELECT id, error_type, message, context, created_at
        FROM error_log
        WHERE agent_id = %s 
        AND created_at >= NOW() - INTERVAL '%s days'
        ORDER BY created_at DESC
        LIMIT 100
        """
        return self.execute_query(query, (agent_id, days))

    def get_agent_integrations(self, agent_id: str) -> List[Dict]:
        """Fetch configured integrations for an agent."""
        query = """
        SELECT id, type, name, configured_at, last_used_at, is_active
        FROM agent_integration
        WHERE agent_id = %s
        ORDER BY configured_at DESC
        """
        return self.execute_query(query, (agent_id,))

    def get_oauth_connections(self, agent_id: str) -> List[Dict]:
        """Fetch OAuth configurations for an agent."""
        query = """
        SELECT id, provider, configured_at, is_active, scope
        FROM oauth_connection
        WHERE agent_id = %s
        ORDER BY configured_at DESC
        """
        return self.execute_query(query, (agent_id,))


# ============================================================================
# AUDIT CHECKERS
# ============================================================================

class AgentAuditor:
    """Performs comprehensive agent audits."""

    def __init__(self, db_auditor: DatabaseAuditor):
        """Initialize with database connection."""
        self.db = db_auditor
        self.issues: List[AuditIssue] = []

    def audit_agent(self, agent: Dict) -> Tuple[List[AuditIssue], Dict[str, float]]:
        """
        Perform comprehensive audit of a single agent.
        Returns: (issues list, scores dict)
        """
        agent_id = agent['id']
        self.issues = []
        scores = {
            'configuration': 100.0,
            'flow': 100.0,
            'knowledge': 100.0,
            'integration': 100.0,
            'security': 100.0,
        }

        # Configuration audit
        scores['configuration'] = self._audit_configuration(agent)

        # Flow integrity audit
        scores['flow'] = self._audit_flow_integrity(agent)

        # Knowledge base audit
        scores['knowledge'] = self._audit_knowledge_base(agent)

        # Integration audit
        scores['integration'] = self._audit_integrations(agent)

        # Security audit
        scores['security'] = self._audit_security(agent)

        return self.issues, scores

    def _audit_configuration(self, agent: Dict) -> float:
        """Audit agent configuration settings."""
        score = 100.0
        agent_id = agent['id']

        # Check required fields
        if not agent.get('name'):
            self._add_issue(
                agent_id, AuditCategory.CONFIGURATION, SeverityLevel.CRITICAL,
                "Missing agent name",
                "Agent has no name defined",
                "Set a descriptive agent name"
            )
            score -= 20

        if not agent.get('description'):
            self._add_issue(
                agent_id, AuditCategory.CONFIGURATION, SeverityLevel.HIGH,
                "Missing description",
                "Agent lacks a description explaining its purpose",
                "Add a clear description of the agent's role and capabilities"
            )
            score -= 10

        # Check model configuration
        if not agent.get('model'):
            self._add_issue(
                agent_id, AuditCategory.CONFIGURATION, SeverityLevel.CRITICAL,
                "No model configured",
                "Agent has no AI model selected",
                "Select an AI model (e.g., deepseek-chat, claude-sonnet-4-6)"
            )
            score -= 25

        # Validate temperature range (0.0-2.0)
        temp = agent.get('temperature')
        if temp is not None and (temp < 0 or temp > 2):
            self._add_issue(
                agent_id, AuditCategory.CONFIGURATION, SeverityLevel.MEDIUM,
                "Invalid temperature setting",
                f"Temperature {temp} is outside valid range [0, 2]",
                "Set temperature between 0 and 2"
            )
            score -= 5

        # Validate top_p range (0.0-1.0)
        top_p = agent.get('top_p')
        if top_p is not None and (top_p < 0 or top_p > 1):
            self._add_issue(
                agent_id, AuditCategory.CONFIGURATION, SeverityLevel.MEDIUM,
                "Invalid top_p setting",
                f"top_p {top_p} is outside valid range [0, 1]",
                "Set top_p between 0 and 1"
            )
            score -= 5

        # Check iteration limit
        max_iter = agent.get('max_iterations', 50)
        if max_iter > 50:
            self._add_issue(
                agent_id, AuditCategory.CONFIGURATION, SeverityLevel.HIGH,
                "Excessive max_iterations",
                f"max_iterations set to {max_iter}, system limit is 50",
                "Reduce max_iterations to 50 or lower"
            )
            score -= 10

        return max(0, score)

    def _audit_flow_integrity(self, agent: Dict) -> float:
        """Audit agent flow configuration."""
        score = 100.0
        agent_id = agent['id']

        flow = self.db.get_agent_flow(agent_id)
        if not flow:
            self._add_issue(
                agent_id, AuditCategory.FLOW_INTEGRITY, SeverityLevel.CRITICAL,
                "No flow defined",
                "Agent has no execution flow configured",
                "Create a flow with at least one node"
            )
            return 0

        try:
            content = json.loads(flow['content']) if isinstance(flow['content'], str) else flow['content']
        except Exception as e:
            self._add_issue(
                agent_id, AuditCategory.FLOW_INTEGRITY, SeverityLevel.CRITICAL,
                "Invalid flow JSON",
                f"Flow content cannot be parsed: {str(e)[:100]}",
                "Validate and fix the flow JSON structure"
            )
            return 0

        # Check nodes
        nodes = content.get('nodes', [])
        if not nodes:
            self._add_issue(
                agent_id, AuditCategory.FLOW_INTEGRITY, SeverityLevel.CRITICAL,
                "Flow has no nodes",
                "Agent flow contains no executable nodes",
                "Add at least one node to the flow"
            )
            score -= 30

        # Check for invalid node types
        valid_node_types = {
            'input', 'output', 'llm_call', 'loop', 'condition', 'variable_set',
            'knowledge_search', 'tool_call', 'human_approval', 'webhook', 'delay'
        }
        for node in nodes:
            node_type = node.get('type')
            if node_type and node_type not in valid_node_types:
                self._add_issue(
                    agent_id, AuditCategory.FLOW_INTEGRITY, SeverityLevel.MEDIUM,
                    "Unknown node type",
                    f"Flow contains unrecognized node type: {node_type}",
                    f"Use valid node types: {', '.join(sorted(valid_node_types))}"
                )
                score -= 5

        # Check edges connectivity
        edges = content.get('edges', [])
        if not edges and len(nodes) > 1:
            self._add_issue(
                agent_id, AuditCategory.FLOW_INTEGRITY, SeverityLevel.HIGH,
                "Disconnected flow graph",
                "Multiple nodes exist but no edges connect them",
                "Add edges to connect the flow nodes"
            )
            score -= 15

        return max(0, score)

    def _audit_knowledge_base(self, agent: Dict) -> float:
        """Audit knowledge base configuration."""
        score = 100.0
        agent_id = agent['id']

        kb_id = agent.get('knowledge_base_id')
        if not kb_id:
            # Knowledge base is optional
            self._add_issue(
                agent_id, AuditCategory.KNOWLEDGE_BASE, SeverityLevel.INFO,
                "No knowledge base attached",
                "Agent does not have a knowledge base configured",
                "Consider attaching a knowledge base if the agent needs domain knowledge"
            )
            return 50  # Reduced score but not critical

        kb = self.db.get_agent_knowledge_base(kb_id)
        if not kb:
            self._add_issue(
                agent_id, AuditCategory.KNOWLEDGE_BASE, SeverityLevel.HIGH,
                "Knowledge base not found",
                f"Referenced knowledge base {kb_id} does not exist in database",
                "Recreate the knowledge base or update the reference"
            )
            return 30

        # Get KB stats
        stats = self.db.get_knowledge_base_stats(kb_id)
        chunk_count = stats.get('total_chunks', 0) if stats else 0

        if chunk_count == 0:
            self._add_issue(
                agent_id, AuditCategory.KNOWLEDGE_BASE, SeverityLevel.HIGH,
                "Empty knowledge base",
                "Knowledge base contains no document chunks",
                "Ingest documents into the knowledge base"
            )
            score -= 30
        elif chunk_count < 10:
            self._add_issue(
                agent_id, AuditCategory.KNOWLEDGE_BASE, SeverityLevel.MEDIUM,
                "Sparse knowledge base",
                f"Knowledge base contains only {chunk_count} chunks",
                "Add more documents to improve coverage"
            )
            score -= 15

        # Check last updated
        last_updated = stats.get('last_updated') if stats else None
        if last_updated:
            days_old = (datetime.now(last_updated.tzinfo) - last_updated).days
            if days_old > 90:
                self._add_issue(
                    agent_id, AuditCategory.KNOWLEDGE_BASE, SeverityLevel.MEDIUM,
                    "Stale knowledge base",
                    f"Knowledge base last updated {days_old} days ago",
                    "Review and refresh knowledge base content"
                )
                score -= 10

        return max(0, score)

    def _audit_integrations(self, agent: Dict) -> float:
        """Audit integration configuration."""
        score = 100.0
        agent_id = agent['id']

        integrations = self.db.get_agent_integrations(agent_id)
        oauth_conns = self.db.get_oauth_connections(agent_id)

        if not integrations and not oauth_conns:
            self._add_issue(
                agent_id, AuditCategory.INTEGRATION, SeverityLevel.INFO,
                "No integrations configured",
                "Agent has no external tool or OAuth integrations",
                "Consider adding integrations to extend agent capabilities"
            )
            return 75  # Reduced but acceptable

        # Check for inactive integrations
        for integration in integrations:
            if not integration.get('is_active'):
                self._add_issue(
                    agent_id, AuditCategory.INTEGRATION, SeverityLevel.MEDIUM,
                    "Inactive integration",
                    f"Integration '{integration.get('name')}' is configured but inactive",
                    "Activate the integration or remove it"
                )
                score -= 5

        # Check OAuth staleness
        for oauth in oauth_conns:
            if not oauth.get('is_active'):
                continue
            last_used = oauth.get('last_used_at')
            if last_used:
                days_unused = (datetime.now(last_used.tzinfo) - last_used).days
                if days_unused > 30:
                    self._add_issue(
                        agent_id, AuditCategory.INTEGRATION, SeverityLevel.LOW,
                        "Unused OAuth connection",
                        f"OAuth '{oauth.get('provider')}' hasn't been used in {days_unused} days",
                        "Review if this integration is still needed"
                    )
                    score -= 3

        return max(0, score)

    def _audit_security(self, agent: Dict) -> float:
        """Audit security configurations."""
        score = 100.0
        agent_id = agent['id']

        # Check if public agents have descriptions (XSS mitigation)
        if agent.get('is_public'):
            if not agent.get('description'):
                self._add_issue(
                    agent_id, AuditCategory.SECURITY, SeverityLevel.MEDIUM,
                    "Public agent lacks description",
                    "Public agents should have descriptions for transparency",
                    "Add a clear description to the public agent"
                )
                score -= 10

        # Check for sensitive data in description/name
        sensitive_keywords = ['api_key', 'password', 'secret', 'token', 'credential']
        name_lower = (agent.get('name') or '').lower()
        desc_lower = (agent.get('description') or '').lower()

        for keyword in sensitive_keywords:
            if keyword in name_lower or keyword in desc_lower:
                self._add_issue(
                    agent_id, AuditCategory.SECURITY, SeverityLevel.HIGH,
                    "Potential credential exposure in metadata",
                    f"Agent name/description contains sensitive keyword: {keyword}",
                    "Remove credentials from metadata; use environment variables"
                )
                score -= 15

        return max(0, score)

    def _add_issue(self, agent_id: str, category: AuditCategory, severity: SeverityLevel,
                   title: str, description: str, recommendation: str):
        """Record an audit issue."""
        self.issues.append(AuditIssue(
            category=category,
            severity=severity,
            title=title,
            description=description,
            recommendation=recommendation,
            agent_id=agent_id
        ))


# ============================================================================
# REPORT GENERATION
# ============================================================================

class ReportGenerator:
    """Generates audit reports in multiple formats."""

    @staticmethod
    def generate_markdown_report(
        all_agents: List[Dict],
        all_metrics: List[AgentMetrics],
        all_issues: Dict[str, List[AuditIssue]],
        timestamp: str
    ) -> str:
        """Generate comprehensive markdown report."""
        report = []
        report.append("# Agent Studio Audit Report\n")
        report.append(f"**Generated:** {timestamp}\n")

        # Executive Summary
        report.append("## Executive Summary\n")
        critical_agents = [m for m in all_metrics if m.critical_issues > 0]
        high_agents = [m for m in all_metrics if m.high_issues > 0 and m.critical_issues == 0]
        report.append(f"- **Total Agents Audited:** {len(all_agents)}\n")
        report.append(f"- **Agents with Critical Issues:** {len(critical_agents)}\n")
        report.append(f"- **Agents with High Issues:** {len(high_agents)}\n")

        avg_score = sum(m.overall_score for m in all_metrics) / len(all_metrics) if all_metrics else 0
        report.append(f"- **Average Overall Score:** {avg_score:.1f}%\n")

        # Attention Required
        report.append("\n## Agents Requiring Immediate Attention\n")
        attention_agents = sorted(
            [m for m in all_metrics if m.needs_immediate_attention],
            key=lambda x: x.overall_score
        )
        if attention_agents:
            for metric in attention_agents[:10]:
                report.append(f"\n### {metric.agent_name}\n")
                report.append(f"- **ID:** `{metric.agent_id}`\n")
                report.append(f"- **Overall Score:** {metric.overall_score:.1f}%\n")
                report.append(f"- **Critical Issues:** {metric.critical_issues}\n")
                report.append(f"- **High Issues:** {metric.high_issues}\n")
                report.append(f"- **Last Updated:** {metric.updated_at}\n")

                # Top issues for this agent
                agent_issues = all_issues.get(metric.agent_id, [])
                critical = [i for i in agent_issues if i.severity == SeverityLevel.CRITICAL]
                if critical:
                    report.append(f"- **Critical Issues:**\n")
                    for issue in critical[:3]:
                        report.append(f"  - {issue.title}: {issue.recommendation}\n")
        else:
            report.append("No agents require immediate attention.\n")

        # Score Distribution
        report.append("\n## Score Distribution\n")
        score_ranges = {
            "90-100%": len([m for m in all_metrics if 90 <= m.overall_score <= 100]),
            "80-89%": len([m for m in all_metrics if 80 <= m.overall_score < 90]),
            "70-79%": len([m for m in all_metrics if 70 <= m.overall_score < 80]),
            "60-69%": len([m for m in all_metrics if 60 <= m.overall_score < 70]),
            "Below 60%": len([m for m in all_metrics if m.overall_score < 60]),
        }
        for range_label, count in score_ranges.items():
            report.append(f"- {range_label}: {count} agents\n")

        # Category Performance
        report.append("\n## Category Performance\n")
        categories = ['configuration', 'flow', 'knowledge', 'integration', 'security']
        for cat in categories:
            scores = [getattr(m, f'{cat}_score') for m in all_metrics]
            avg = sum(scores) / len(scores) if scores else 0
            report.append(f"- **{cat.title()}:** {avg:.1f}%\n")

        # All Issues Summary
        report.append("\n## All Issues by Severity\n")
        all_issues_flat = []
        for issues in all_issues.values():
            all_issues_flat.extend(issues)

        for severity in [SeverityLevel.CRITICAL, SeverityLevel.HIGH, SeverityLevel.MEDIUM]:
            severity_issues = [i for i in all_issues_flat if i.severity == severity]
            if severity_issues:
                report.append(f"\n### {severity.value} ({len(severity_issues)})\n")
                grouped = {}
                for issue in severity_issues:
                    key = issue.title
                    if key not in grouped:
                        grouped[key] = []
                    grouped[key].append(issue)

                for title, issues in sorted(grouped.items()):
                    report.append(f"\n**{title}** ({len(issues)} agents)\n")
                    report.append(f"- {issues[0].description}\n")
                    report.append(f"- **Action:** {issues[0].recommendation}\n")

        # Footer
        report.append("\n---\n")
        report.append("*This audit was generated by Agent Studio Auditor.*\n")

        return "".join(report)

    @staticmethod
    def generate_metrics_json(all_metrics: List[AgentMetrics]) -> str:
        """Generate metrics as JSON."""
        metrics_list = [asdict(m) for m in all_metrics]
        return json.dumps(metrics_list, indent=2, default=str)


# ============================================================================
# MAIN EXECUTION
# ============================================================================

def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Agent Studio Audit & Scoring System")
    parser.add_argument('--db-url', required=True, help='PostgreSQL connection string')
    parser.add_argument('--output', default='audit_output.md', help='Output markdown file')
    parser.add_argument('--metrics', default='metrics.json', help='Output metrics JSON file')

    args = parser.parse_args()

    print("=" * 70)
    print("AGENT STUDIO AUDIT & SCORING SYSTEM")
    print("=" * 70)
    print()

    # Initialize database auditor
    db_auditor = DatabaseAuditor(args.db_url)

    if not db_auditor.connect():
        print("ERROR: Cannot connect to database")
        return 1

    try:
        # Fetch all agents
        print("Fetching agents from database...")
        agents = db_auditor.get_all_agents()
        print(f"Found {len(agents)} agents")

        if not agents:
            print("No agents found in database")
            return 0

        # Audit each agent
        print("\nAuditing agents...")
        agent_auditor = AgentAuditor(db_auditor)
        all_metrics = []
        all_issues = {}

        for i, agent in enumerate(agents, 1):
            agent_id = agent['id']
            agent_name = agent.get('name', 'Unnamed')
            print(f"  [{i}/{len(agents)}] {agent_name}...", end=' ')

            issues, scores = agent_auditor.audit_agent(agent)
            all_issues[agent_id] = issues

            # Calculate overall score (weighted average)
            overall = (
                scores['configuration'] * 0.25 +
                scores['flow'] * 0.30 +
                scores['knowledge'] * 0.20 +
                scores['integration'] * 0.15 +
                scores['security'] * 0.10
            )

            # Determine if needs attention
            critical_count = len([i for i in issues if i.severity == SeverityLevel.CRITICAL])
            high_count = len([i for i in issues if i.severity == SeverityLevel.HIGH])
            needs_attention = critical_count > 0 or overall < 70

            metric = AgentMetrics(
                agent_id=agent_id,
                agent_name=agent_name,
                created_at=str(agent.get('created_at', '')),
                updated_at=str(agent.get('updated_at', '')),
                total_issues=len(issues),
                critical_issues=critical_count,
                high_issues=high_count,
                configuration_score=scores['configuration'],
                flow_score=scores['flow'],
                knowledge_score=scores['knowledge'],
                integration_score=scores['integration'],
                security_score=scores['security'],
                overall_score=overall,
                needs_immediate_attention=needs_attention,
            )
            all_metrics.append(metric)
            print(f"Score: {overall:.1f}%")

        # Generate reports
        print("\nGenerating reports...")
        timestamp = datetime.now().isoformat()

        markdown_report = ReportGenerator.generate_markdown_report(
            agents, all_metrics, all_issues, timestamp
        )
        metrics_json = ReportGenerator.generate_metrics_json(all_metrics)

        # Write outputs
        with open(args.output, 'w') as f:
            f.write(markdown_report)
        print(f"  Markdown report: {args.output}")

        with open(args.metrics, 'w') as f:
            f.write(metrics_json)
        print(f"  Metrics JSON: {args.metrics}")

        print("\n" + "=" * 70)
        print("AUDIT COMPLETE")
        print("=" * 70)

        return 0

    finally:
        db_auditor.disconnect()


if __name__ == '__main__':
    sys.exit(main())
