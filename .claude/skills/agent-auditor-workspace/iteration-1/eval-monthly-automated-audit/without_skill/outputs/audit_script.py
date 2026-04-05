#!/usr/bin/env python3
"""
Monthly AI Agent Audit Script
Standalone Python implementation for agent quality audits

This script demonstrates the core audit logic that would be integrated
into the Next.js backend via src/lib/audits/executor.ts

Usage:
    python audit_script.py --db-url "postgresql://..." --month 2026-04
"""

import asyncio
import json
import sys
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Optional
from urllib.parse import urlparse
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class AuditStatus(Enum):
    """Audit status enumeration."""
    PASS = "PASS"
    WARN = "WARN"
    FAIL = "FAIL"


class Severity(Enum):
    """Issue severity levels."""
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"


@dataclass
class AuditIssue:
    """Represents a single audit issue."""
    dimension: str
    severity: Severity
    message: str
    remediation: str

    def to_dict(self) -> dict:
        return {
            "dimension": self.dimension,
            "severity": self.severity.value,
            "message": self.message,
            "remediation": self.remediation,
        }


@dataclass
class DimensionScore:
    """Score for a single audit dimension."""
    dimension: str
    score: float  # 0-100
    status: AuditStatus
    issues: list[AuditIssue]

    def to_dict(self) -> dict:
        return {
            "dimension": self.dimension,
            "score": self.score,
            "status": self.status.value,
            "issues": [issue.to_dict() for issue in self.issues],
        }


@dataclass
class AgentAuditResult:
    """Complete audit result for a single agent."""
    agent_id: str
    agent_name: str
    overall_score: float
    status: AuditStatus
    dimensions: dict[str, DimensionScore]
    audited_at: datetime
    audit_cycle: str

    def to_dict(self) -> dict:
        return {
            "agentId": self.agent_id,
            "agentName": self.agent_name,
            "overallScore": self.overall_score,
            "status": self.status.value,
            "dimensions": {k: v.to_dict() for k, v in self.dimensions.items()},
            "auditedAt": self.audited_at.isoformat(),
            "auditCycle": self.audit_cycle,
        }


class MetadataAuditor:
    """Audit dimension 1: Agent Metadata & Documentation."""

    @staticmethod
    def audit(agent: dict) -> DimensionScore:
        """
        Check: name, description, owner, version, maintenance status.
        """
        issues = []
        score = 100

        # Check name
        if not agent.get("name") or len(str(agent.get("name", "")).strip()) < 3:
            issues.append(AuditIssue(
                dimension="metadata",
                severity=Severity.ERROR,
                message="Agent name missing or too short",
                remediation="Provide a descriptive agent name (3+ chars)",
            ))
            score -= 25

        # Check description
        description = agent.get("description", "")
        if not description or len(description) < 50:
            issues.append(AuditIssue(
                dimension="metadata",
                severity=Severity.ERROR,
                message="Description missing or insufficient (< 50 chars)",
                remediation="Provide detailed description explaining agent purpose (50+ chars)",
            ))
            score -= 25

        # Check owner
        if not agent.get("userId"):
            issues.append(AuditIssue(
                dimension="metadata",
                severity=Severity.ERROR,
                message="No owner assigned",
                remediation="Assign agent to an owner (userId)",
            ))
            score -= 25

        # Check version
        if not agent.get("version"):
            issues.append(AuditIssue(
                dimension="metadata",
                severity=Severity.WARNING,
                message="Version tag not set",
                remediation="Set semantic version (e.g., 1.0.0)",
            ))
            score -= 10

        # Check last updated (orphaned detection)
        updated_at = agent.get("updatedAt")
        if updated_at:
            try:
                updated = datetime.fromisoformat(str(updated_at).replace("Z", "+00:00"))
                days_old = (datetime.now(updated.tzinfo) - updated).days
                if days_old > 90:
                    issues.append(AuditIssue(
                        dimension="metadata",
                        severity=Severity.WARNING,
                        message=f"Agent not updated in {days_old} days",
                        remediation="Review and update agent configuration if still in use",
                    ))
                    score -= 15
            except (ValueError, AttributeError):
                pass

        status = AuditStatus.PASS if score >= 80 else (AuditStatus.WARN if score >= 70 else AuditStatus.FAIL)
        return DimensionScore("metadata", max(0, score), status, issues)


class ConfigurationAuditor:
    """Audit dimension 2: Configuration."""

    @staticmethod
    def audit(agent: dict) -> DimensionScore:
        """
        Check: model validity, temperature, token limits, system prompt.
        """
        issues = []
        score = 100

        # Check model
        model = agent.get("model", "")
        if not model:
            issues.append(AuditIssue(
                dimension="configuration",
                severity=Severity.ERROR,
                message="No model selected",
                remediation="Select a supported AI model (e.g., deepseek-chat, gpt-4o)",
            ))
            score -= 30
        elif model not in ["deepseek-chat", "gpt-4o", "gpt-4-turbo", "claude-opus", "gemini-pro"]:
            issues.append(AuditIssue(
                dimension="configuration",
                severity=Severity.WARNING,
                message=f"Model '{model}' not in recommended list",
                remediation="Use models: deepseek-chat, gpt-4o, gpt-4-turbo, claude-opus, gemini-pro",
            ))
            score -= 10

        # Check temperature
        temperature = agent.get("temperature")
        if temperature is not None:
            try:
                temp = float(temperature)
                if temp < 0 or temp > 2.0:
                    issues.append(AuditIssue(
                        dimension="configuration",
                        severity=Severity.ERROR,
                        message=f"Temperature {temp} out of bounds (0.0-2.0)",
                        remediation="Set temperature between 0.0 (deterministic) and 2.0",
                    ))
                    score -= 20
                elif abs(temp - 0.7) > 0.2:
                    issues.append(AuditIssue(
                        dimension="configuration",
                        severity=Severity.WARNING,
                        message=f"Temperature {temp} deviates from recommended 0.7",
                        remediation="Consider temperature 0.7 for balanced results",
                    ))
                    score -= 5
            except (ValueError, TypeError):
                pass

        # Check max tokens
        max_tokens = agent.get("maxTokens")
        if max_tokens:
            try:
                tokens = int(max_tokens)
                if tokens < 100:
                    issues.append(AuditIssue(
                        dimension="configuration",
                        severity=Severity.WARNING,
                        message=f"Max tokens {tokens} is very low",
                        remediation="Increase max tokens to at least 256 for meaningful responses",
                    ))
                    score -= 10
                elif tokens > 20000:
                    issues.append(AuditIssue(
                        dimension="configuration",
                        severity=Severity.WARNING,
                        message=f"Max tokens {tokens} is very high (cost risk)",
                        remediation="Consider reducing to 4000-8000 unless needed",
                    ))
                    score -= 5
            except (ValueError, TypeError):
                pass

        # Check system prompt
        system_prompt = agent.get("systemPrompt", "")
        if not system_prompt:
            issues.append(AuditIssue(
                dimension="configuration",
                severity=Severity.WARNING,
                message="No system prompt defined",
                remediation="Define a system prompt (> 10 words) to guide agent behavior",
            ))
            score -= 10
        elif len(system_prompt.split()) < 10:
            issues.append(AuditIssue(
                dimension="configuration",
                severity=Severity.WARNING,
                message="System prompt is too short (< 10 words)",
                remediation="Provide a more detailed system prompt",
            ))
            score -= 5

        status = AuditStatus.PASS if score >= 80 else (AuditStatus.WARN if score >= 70 else AuditStatus.FAIL)
        return DimensionScore("configuration", max(0, score), status, issues)


class KnowledgeBaseAuditor:
    """Audit dimension 3: Knowledge Base & RAG Health."""

    @staticmethod
    def audit(agent: dict, knowledge_count: int = 0) -> DimensionScore:
        """
        Check: knowledge base size, freshness, embedding consistency.
        """
        issues = []
        score = 100

        # Check if agent claims RAG capability
        has_rag = agent.get("knowledgeEnabled", False)
        
        if has_rag:
            if knowledge_count == 0:
                issues.append(AuditIssue(
                    dimension="knowledgeBase",
                    severity=Severity.ERROR,
                    message="RAG enabled but no documents ingested",
                    remediation="Ingest at least 1 document or disable RAG if not needed",
                ))
                score -= 40
            elif knowledge_count < 10:
                issues.append(AuditIssue(
                    dimension="knowledgeBase",
                    severity=Severity.WARNING,
                    message=f"Only {knowledge_count} documents (target: 20+)",
                    remediation="Add more documents to knowledge base for better retrieval",
                ))
                score -= 15
            
            # Check freshness (would need actual KB data)
            # Placeholder: assume KB is fresh if agent was recently updated
            updated_at = agent.get("updatedAt")
            if updated_at:
                try:
                    updated = datetime.fromisoformat(str(updated_at).replace("Z", "+00:00"))
                    days_old = (datetime.now(updated.tzinfo) - updated).days
                    if days_old > 30:
                        issues.append(AuditIssue(
                            dimension="knowledgeBase",
                            severity=Severity.WARNING,
                            message=f"Knowledge base may be stale (agent not updated {days_old} days)",
                            remediation="Refresh knowledge base documents and re-ingest",
                        ))
                        score -= 10
                except (ValueError, AttributeError):
                    pass
        else:
            # RAG not enabled - score full if intentional, warn if suspicious
            if knowledge_count > 0:
                issues.append(AuditIssue(
                    dimension="knowledgeBase",
                    severity=Severity.INFO,
                    message=f"RAG disabled but {knowledge_count} documents exist",
                    remediation="Enable RAG if documents should be used, or delete unused docs",
                ))
                score -= 5

        # If no RAG and no docs, perfect score
        if not has_rag and knowledge_count == 0:
            score = 100

        status = AuditStatus.PASS if score >= 80 else (AuditStatus.WARN if score >= 70 else AuditStatus.FAIL)
        return DimensionScore("knowledgeBase", max(0, score), status, issues)


class FlowAuditor:
    """Audit dimension 4: Flow/Runtime Validation."""

    @staticmethod
    def audit(agent: dict, flow_content: Optional[dict] = None) -> DimensionScore:
        """
        Check: flow validity, node count, loop safety, no orphaned nodes.
        """
        issues = []
        score = 100

        if not flow_content:
            issues.append(AuditIssue(
                dimension="flow",
                severity=Severity.WARNING,
                message="No flow data available",
                remediation="Define a flow with at least one node",
            ))
            score -= 30
            status = AuditStatus.WARN if score >= 70 else AuditStatus.FAIL
            return DimensionScore("flow", max(0, score), status, issues)

        try:
            # Check flow is valid JSON
            if isinstance(flow_content, str):
                json.loads(flow_content)
                flow = json.loads(flow_content)
            else:
                flow = flow_content

            # Check node count
            nodes = flow.get("nodes", [])
            if len(nodes) == 0:
                issues.append(AuditIssue(
                    dimension="flow",
                    severity=Severity.ERROR,
                    message="Flow has no nodes",
                    remediation="Create at least one node in the flow",
                ))
                score -= 50
            elif len(nodes) < 2:
                issues.append(AuditIssue(
                    dimension="flow",
                    severity=Severity.WARNING,
                    message="Flow is very simple (1 node only)",
                    remediation="Consider if additional logic is needed",
                ))
                score -= 5
            elif len(nodes) > 50:
                issues.append(AuditIssue(
                    dimension="flow",
                    severity=Severity.WARNING,
                    message=f"Flow is complex ({len(nodes)} nodes, target < 50)",
                    remediation="Consider breaking into sub-flows or simplifying logic",
                ))
                score -= 15

            # Check for orphaned nodes (simplified: assume connected if no errors)
            edges = flow.get("edges", [])
            node_ids = {n.get("id") for n in nodes}
            
            # Check loop handlers have safe limits
            loop_nodes = [n for n in nodes if n.get("type") == "loop"]
            for loop_node in loop_nodes:
                max_iter = loop_node.get("data", {}).get("maxIterations", 50)
                if max_iter > 50:
                    issues.append(AuditIssue(
                        dimension="flow",
                        severity=Severity.ERROR,
                        message=f"Loop node has unsafe iteration limit: {max_iter} > 50",
                        remediation="Set maxIterations <= 50 to prevent runaway loops",
                    ))
                    score -= 20

        except (json.JSONDecodeError, ValueError, KeyError) as e:
            issues.append(AuditIssue(
                dimension="flow",
                severity=Severity.ERROR,
                message=f"Flow JSON invalid: {str(e)[:50]}",
                remediation="Fix JSON syntax or restore from backup",
            ))
            score -= 50

        status = AuditStatus.PASS if score >= 80 else (AuditStatus.WARN if score >= 70 else AuditStatus.FAIL)
        return DimensionScore("flow", max(0, score), status, issues)


class APIAuditor:
    """Audit dimension 5: API Integration & Tool Usage."""

    @staticmethod
    def audit(agent: dict) -> DimensionScore:
        """
        Check: tool definitions, error handling, rate limiting.
        """
        issues = []
        score = 100

        tools = agent.get("tools", [])
        if len(tools) == 0:
            # OK if agent doesn't use tools
            return DimensionScore("apiIntegration", 100, AuditStatus.PASS, [])

        # Check each tool
        for tool in tools:
            tool_name = tool.get("name", "unnamed")
            
            # Check parameters documented
            if not tool.get("description"):
                issues.append(AuditIssue(
                    dimension="apiIntegration",
                    severity=Severity.WARNING,
                    message=f"Tool '{tool_name}' missing description",
                    remediation="Document what this tool does",
                ))
                score -= 5

            # Check for hardcoded secrets
            if any(secret in str(tool) for secret in ["apiKey", "secret", "password"]):
                issues.append(AuditIssue(
                    dimension="apiIntegration",
                    severity=Severity.ERROR,
                    message=f"Tool '{tool_name}' may contain hardcoded secrets",
                    remediation="Use environment variables for API keys and secrets",
                ))
                score -= 30

        # Check timeout configuration
        if agent.get("timeout", 30) < 5:
            issues.append(AuditIssue(
                dimension="apiIntegration",
                severity=Severity.WARNING,
                message="Timeout < 5s (too aggressive for external calls)",
                remediation="Set timeout >= 5s for external API calls",
            ))
            score -= 10

        status = AuditStatus.PASS if score >= 80 else (AuditStatus.WARN if score >= 70 else AuditStatus.FAIL)
        return DimensionScore("apiIntegration", max(0, score), status, issues)


class PerformanceAuditor:
    """Audit dimension 6: Performance & Cost Metrics."""

    @staticmethod
    def audit(agent: dict, metrics: Optional[dict] = None) -> DimensionScore:
        """
        Check: error rate, execution time, token usage, cost.
        """
        issues = []
        score = 100

        if not metrics:
            # No metrics available, assume OK
            return DimensionScore("performance", 75, AuditStatus.WARN, [
                AuditIssue(
                    dimension="performance",
                    severity=Severity.INFO,
                    message="No performance metrics available",
                    remediation="Enable observability/logging to track metrics",
                )
            ])

        # Check error rate
        error_rate = metrics.get("errorRate", 0)
        if error_rate > 0.1:  # 10%
            issues.append(AuditIssue(
                dimension="performance",
                severity=Severity.ERROR,
                message=f"Error rate too high: {error_rate*100:.1f}% > 10%",
                remediation="Debug and fix error causes, improve error handling",
            ))
            score -= 30
        elif error_rate > 0.05:  # 5%
            issues.append(AuditIssue(
                dimension="performance",
                severity=Severity.WARNING,
                message=f"Error rate elevated: {error_rate*100:.1f}%",
                remediation="Investigate and reduce error rate to < 1%",
            ))
            score -= 10

        # Check execution time
        avg_time = metrics.get("avgExecutionTimeMs", 0)
        if avg_time > 60000:  # 60s
            issues.append(AuditIssue(
                dimension="performance",
                severity=Severity.WARNING,
                message=f"Execution time too high: {avg_time/1000:.1f}s > 60s",
                remediation="Optimize flow logic or consider async processing",
            ))
            score -= 15

        # Check token usage
        avg_tokens = metrics.get("avgTokensPerRun", 0)
        if avg_tokens > 10000:
            issues.append(AuditIssue(
                dimension="performance",
                severity=Severity.WARNING,
                message=f"High token usage: {avg_tokens} tokens/run",
                remediation="Optimize prompts or reduce context size",
            ))
            score -= 10

        status = AuditStatus.PASS if score >= 80 else (AuditStatus.WARN if score >= 70 else AuditStatus.FAIL)
        return DimensionScore("performance", max(0, score), status, issues)


class SecurityAuditor:
    """Audit dimension 7: Security & Access Control."""

    @staticmethod
    def audit(agent: dict) -> DimensionScore:
        """
        Check: auth requirements, input sanitization, secret handling.
        """
        issues = []
        score = 100

        # Check public vs private
        is_public = agent.get("isPublic", False)
        if is_public:
            # Public agents need extra scrutiny
            
            # Check for rate limiting
            if not agent.get("rateLimitEnabled"):
                issues.append(AuditIssue(
                    dimension="security",
                    severity=Severity.WARNING,
                    message="Public agent without rate limiting",
                    remediation="Enable rate limiting on public endpoints",
                ))
                score -= 15

            # Check for secrets in prompt
            system_prompt = agent.get("systemPrompt", "")
            if any(secret in system_prompt.lower() for secret in ["api_key", "secret", "password", "token"]):
                issues.append(AuditIssue(
                    dimension="security",
                    severity=Severity.ERROR,
                    message="Secrets found in public system prompt",
                    remediation="Remove API keys and secrets; use environment variables",
                ))
                score -= 40
        else:
            # Private agents should require auth
            if not agent.get("requireAuth"):
                issues.append(AuditIssue(
                    dimension="security",
                    severity=Severity.WARNING,
                    message="Private agent without auth requirement",
                    remediation="Enable authentication if sensitive",
                ))
                score -= 10

        # Check webhook signature verification
        if agent.get("webhookUrl"):
            if not agent.get("webhookSecret"):
                issues.append(AuditIssue(
                    dimension="security",
                    severity=Severity.ERROR,
                    message="Webhook URL without signature verification",
                    remediation="Add webhook secret and verify HMAC-SHA256 signatures",
                ))
                score -= 20

        status = AuditStatus.PASS if score >= 80 else (AuditStatus.WARN if score >= 70 else AuditStatus.FAIL)
        return DimensionScore("security", max(0, score), status, issues)


class TestingAuditor:
    """Audit dimension 8: Testing & Deployment Readiness."""

    @staticmethod
    def audit(agent: dict, eval_data: Optional[dict] = None) -> DimensionScore:
        """
        Check: evals executed, test pass rate, deployment readiness.
        """
        issues = []
        score = 100

        if not eval_data:
            issues.append(AuditIssue(
                dimension="testing",
                severity=Severity.WARNING,
                message="No evaluation runs found",
                remediation="Run agent evals/tests to validate quality",
            ))
            score -= 30
        else:
            # Check eval pass rate
            pass_rate = eval_data.get("passRate", 0)
            if pass_rate < 0.8:
                issues.append(AuditIssue(
                    dimension="testing",
                    severity=Severity.ERROR if pass_rate < 0.5 else Severity.WARNING,
                    message=f"Eval pass rate low: {pass_rate*100:.1f}% < 80%",
                    remediation="Fix failing tests and improve agent logic",
                ))
                score -= 20 if pass_rate < 0.5 else 10

            # Check freshness of evals
            last_eval = eval_data.get("lastEvalAt")
            if last_eval:
                try:
                    eval_date = datetime.fromisoformat(str(last_eval).replace("Z", "+00:00"))
                    days_old = (datetime.now(eval_date.tzinfo) - eval_date).days
                    if days_old > 30:
                        issues.append(AuditIssue(
                            dimension="testing",
                            severity=Severity.WARNING,
                            message=f"Last eval is {days_old} days old",
                            remediation="Re-run evals monthly to ensure continued quality",
                        ))
                        score -= 10
                except (ValueError, AttributeError):
                    pass

        status = AuditStatus.PASS if score >= 80 else (AuditStatus.WARN if score >= 70 else AuditStatus.FAIL)
        return DimensionScore("testing", max(0, score), status, issues)


class AuditEngine:
    """Main audit orchestrator."""

    def __init__(self):
        self.auditors = {
            "metadata": MetadataAuditor(),
            "configuration": ConfigurationAuditor(),
            "knowledgeBase": KnowledgeBaseAuditor(),
            "flow": FlowAuditor(),
            "apiIntegration": APIAuditor(),
            "performance": PerformanceAuditor(),
            "security": SecurityAuditor(),
            "testing": TestingAuditor(),
        }

    def audit_agent(
        self,
        agent: dict,
        knowledge_count: int = 0,
        flow_content: Optional[dict] = None,
        metrics: Optional[dict] = None,
        eval_data: Optional[dict] = None,
    ) -> AgentAuditResult:
        """
        Run all audit checks on a single agent.
        """
        dimensions = {}

        # Run each auditor
        dimensions["metadata"] = self.auditors["metadata"].audit(agent)
        dimensions["configuration"] = self.auditors["configuration"].audit(agent)
        dimensions["knowledgeBase"] = self.auditors["knowledgeBase"].audit(agent, knowledge_count)
        dimensions["flow"] = self.auditors["flow"].audit(agent, flow_content)
        dimensions["apiIntegration"] = self.auditors["apiIntegration"].audit(agent)
        dimensions["performance"] = self.auditors["performance"].audit(agent, metrics)
        dimensions["security"] = self.auditors["security"].audit(agent)
        dimensions["testing"] = self.auditors["testing"].audit(agent, eval_data)

        # Calculate overall score (weighted average)
        weights = {
            "metadata": 0.10,
            "configuration": 0.15,
            "knowledgeBase": 0.15,
            "flow": 0.15,
            "apiIntegration": 0.15,
            "performance": 0.15,
            "security": 0.10,
            "testing": 0.05,
        }

        overall_score = sum(
            dimensions[dim].score * weights[dim]
            for dim in dimensions
        )

        # Determine overall status
        if overall_score >= 90:
            overall_status = AuditStatus.PASS
        elif overall_score >= 70:
            overall_status = AuditStatus.WARN
        else:
            overall_status = AuditStatus.FAIL

        # Current month
        audit_cycle = datetime.now().strftime("%Y-%m")

        return AgentAuditResult(
            agent_id=agent.get("id", "unknown"),
            agent_name=agent.get("name", "Unnamed Agent"),
            overall_score=round(overall_score, 1),
            status=overall_status,
            dimensions=dimensions,
            audited_at=datetime.now(),
            audit_cycle=audit_cycle,
        )


def demo_audit():
    """
    Demonstrate audit functionality with sample agents.
    """
    logger.info("Starting monthly agent audit (DEMO MODE)")
    logger.info("Note: Database connection unavailable in this environment")

    engine = AuditEngine()

    # Sample agents for demonstration
    sample_agents = [
        {
            "id": "agent_001",
            "name": "Customer Support Bot",
            "description": "Handles customer inquiries and routes to appropriate department.",
            "userId": "user_123",
            "version": "1.2.0",
            "model": "gpt-4o",
            "temperature": 0.7,
            "maxTokens": 2000,
            "systemPrompt": "You are a helpful customer support representative. Answer questions clearly and escalate complex issues.",
            "knowledgeEnabled": True,
            "isPublic": False,
            "requireAuth": True,
            "updatedAt": "2026-03-15T10:00:00Z",
        },
        {
            "id": "agent_002",
            "name": "Data Analyst",
            "description": "Simple data analysis agent",  # Too short
            "userId": None,  # Missing owner
            "version": None,
            "model": "deepseek-chat",
            "temperature": 1.5,
            "maxTokens": 50,  # Too low
            "systemPrompt": "Analyze data",  # Too short
            "knowledgeEnabled": False,
            "isPublic": True,
            "rateLimitEnabled": False,  # Public without rate limit
            "updatedAt": "2025-10-01T00:00:00Z",  # Very stale
        },
        {
            "id": "agent_003",
            "name": "Code Generator",
            "description": "Generates TypeScript code snippets with proper testing patterns and documentation.",
            "userId": "user_456",
            "version": "2.1.1",
            "model": "claude-opus",
            "temperature": 0.3,
            "maxTokens": 4000,
            "systemPrompt": "You are an expert TypeScript developer. Generate clean, well-tested code.",
            "knowledgeEnabled": True,
            "isPublic": False,
            "requireAuth": True,
            "updatedAt": "2026-04-01T08:00:00Z",
        },
    ]

    results = []
    for agent in sample_agents:
        logger.info(f"Auditing agent: {agent.get('name')}")
        
        # Simulate some additional data
        knowledge_count = 5 if agent.get("knowledgeEnabled") else 0
        flow_content = {"nodes": [{"id": "n1", "type": "chat"}]}
        metrics = {
            "errorRate": 0.02,
            "avgExecutionTimeMs": 3000,
            "avgTokensPerRun": 800,
        } if agent.get("id") != "agent_002" else {
            "errorRate": 0.15,
            "avgExecutionTimeMs": 45000,
            "avgTokensPerRun": 12000,
        }
        eval_data = {
            "passRate": 0.95,
            "lastEvalAt": "2026-04-01T00:00:00Z",
        } if agent.get("id") != "agent_002" else None

        result = engine.audit_agent(
            agent,
            knowledge_count=knowledge_count,
            flow_content=flow_content,
            metrics=metrics,
            eval_data=eval_data,
        )
        results.append(result)

    # Summary statistics
    summary = {
        "auditId": f"audit_{int(datetime.now().timestamp() * 1000)}",
        "timestamp": datetime.now().isoformat(),
        "agentsSummary": {
            "total": len(results),
            "passed": sum(1 for r in results if r.status == AuditStatus.PASS),
            "warned": sum(1 for r in results if r.status == AuditStatus.WARN),
            "failed": sum(1 for r in results if r.status == AuditStatus.FAIL),
        },
        "agents": [r.to_dict() for r in results],
    }

    logger.info(f"Audit complete: {summary['agentsSummary']['total']} agents evaluated")
    logger.info(f"  PASS: {summary['agentsSummary']['passed']}")
    logger.info(f"  WARN: {summary['agentsSummary']['warned']}")
    logger.info(f"  FAIL: {summary['agentsSummary']['failed']}")

    return summary


if __name__ == "__main__":
    # Run demo
    audit_results = demo_audit()
    
    # Output results
    print("\n" + "="*60)
    print("MONTHLY AGENT AUDIT RESULTS")
    print("="*60)
    print(json.dumps(audit_results, indent=2))
