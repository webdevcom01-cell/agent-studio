import { prisma } from "@/lib/prisma";
import { getHandler } from "@/lib/runtime/handlers";
import { logger } from "@/lib/logger";
import type { FlowContent, FlowNode } from "@/types";

export interface PostDeployCheck {
  name: string;
  status: "passed" | "failed" | "skipped" | "warning";
  message: string;
  durationMs: number;
}

export interface PostDeployVerification {
  passed: boolean;
  checks: PostDeployCheck[];
  summary: string;
  failedChecks: string[];
  duration: number;
}

const START_NODE_TYPES = new Set(["message", "webhook_trigger", "schedule_trigger"]);

const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/i,
  /ghp_[a-zA-Z0-9]{36}/i,
  /AKIA[A-Z0-9]{16}/,
];

const RUNTIME_INJECTED_PREFIXES = ["__webhook_", "__trigger_", "__cost_", "__parallel_", "__last_", "__function_", "__model_tier_"];

/**
 * Runs 6 post-deploy verification checks on a flow.
 * Returns a structured result with pass/fail per check.
 */
export async function verifyDeployment(
  flowContent: FlowContent,
  agentId: string,
): Promise<PostDeployVerification> {
  const totalStart = Date.now();
  const checks: PostDeployCheck[] = [];

  checks.push(checkFlowIntegrity(flowContent));
  checks.push(checkHandlerCoverage(flowContent));
  checks.push(checkVariableReferences(flowContent));
  checks.push(checkEdgeConnectivity(flowContent));
  checks.push(checkSecurityScan(flowContent));
  checks.push(await checkAgentReachability(flowContent, agentId));

  const failedChecks = checks
    .filter((c) => c.status === "failed")
    .map((c) => c.name);

  const passedCount = checks.filter((c) => c.status === "passed" || c.status === "warning").length;
  const duration = Date.now() - totalStart;

  const result: PostDeployVerification = {
    passed: failedChecks.length === 0,
    checks,
    summary: `${passedCount}/${checks.length} checks passed`,
    failedChecks,
    duration,
  };

  logger.info("Post-deploy verification complete", {
    agentId,
    passed: result.passed,
    summary: result.summary,
    durationMs: duration,
  });

  return result;
}

// ── 1. Flow Integrity ────────────────────────────────────────────────────────

function checkFlowIntegrity(flow: FlowContent): PostDeployCheck {
  const start = Date.now();

  if (flow.nodes.length === 0) {
    return {
      name: "flow-integrity",
      status: "failed",
      message: "Flow has no nodes",
      durationMs: Date.now() - start,
    };
  }

  const hasStart = flow.nodes.some((n) => START_NODE_TYPES.has(n.type));
  const hasEnd = flow.nodes.some((n) => n.type === "end");
  const issues: string[] = [];

  if (!hasStart) issues.push("no start node (message, webhook_trigger, or schedule_trigger)");
  if (!hasEnd) issues.push("no end node");

  if (issues.length > 0) {
    return {
      name: "flow-integrity",
      status: "failed",
      message: `Flow integrity issues: ${issues.join(", ")}`,
      durationMs: Date.now() - start,
    };
  }

  return {
    name: "flow-integrity",
    status: "passed",
    message: "Flow has valid start and end nodes",
    durationMs: Date.now() - start,
  };
}

// ── 2. Handler Coverage ──────────────────────────────────────────────────────

function checkHandlerCoverage(flow: FlowContent): PostDeployCheck {
  const start = Date.now();
  const missingHandlers: string[] = [];

  for (const node of flow.nodes) {
    if (!getHandler(node.type)) {
      missingHandlers.push(`${node.id} (${node.type})`);
    }
  }

  if (missingHandlers.length > 0) {
    return {
      name: "handler-coverage",
      status: "failed",
      message: `Missing handlers: ${missingHandlers.join(", ")}`,
      durationMs: Date.now() - start,
    };
  }

  return {
    name: "handler-coverage",
    status: "passed",
    message: `All ${flow.nodes.length} nodes have registered handlers`,
    durationMs: Date.now() - start,
  };
}

// ── 3. Variable References ───────────────────────────────────────────────────

function checkVariableReferences(flow: FlowContent): PostDeployCheck {
  const start = Date.now();
  const definedVars = new Set(flow.variables.map((v) => v.name));
  const templatePattern = /\{\{(\w+(?:[\.\[]\w+[\]]*)*)\}\}/g;
  const undefinedVars: string[] = [];
  const warningVars: string[] = [];

  for (const node of flow.nodes) {
    const strings = extractStringsFromData(node.data);
    for (const str of strings) {
      let match: RegExpExecArray | null;
      const regex = new RegExp(templatePattern.source, templatePattern.flags);
      while ((match = regex.exec(str)) !== null) {
        const varName = match[1].split(".")[0].split("[")[0];
        if (definedVars.has(varName)) continue;
        if (isRuntimeInjected(varName)) {
          if (!warningVars.includes(varName)) warningVars.push(varName);
          continue;
        }
        if (!undefinedVars.includes(varName)) undefinedVars.push(varName);
      }
    }
  }

  if (undefinedVars.length > 0) {
    return {
      name: "variable-references",
      status: "failed",
      message: `Undefined variables: ${undefinedVars.join(", ")}`,
      durationMs: Date.now() - start,
    };
  }

  if (warningVars.length > 0) {
    return {
      name: "variable-references",
      status: "warning",
      message: `Runtime-injected variables (OK): ${warningVars.join(", ")}`,
      durationMs: Date.now() - start,
    };
  }

  return {
    name: "variable-references",
    status: "passed",
    message: "All variable references are defined",
    durationMs: Date.now() - start,
  };
}

function isRuntimeInjected(varName: string): boolean {
  return RUNTIME_INJECTED_PREFIXES.some((p) => varName.startsWith(p))
    || varName === "last_message";
}

function extractStringsFromData(data: Record<string, unknown>): string[] {
  const strings: string[] = [];
  for (const value of Object.values(data)) {
    if (typeof value === "string") {
      strings.push(value);
    }
  }
  return strings;
}

// ── 4. Edge Connectivity ─────────────────────────────────────────────────────

function checkEdgeConnectivity(flow: FlowContent): PostDeployCheck {
  const start = Date.now();
  const nodesWithoutEdge: string[] = [];
  const sourceNodes = new Set(flow.edges.map((e) => e.source));

  for (const node of flow.nodes) {
    if (node.type === "end") continue;
    if (!sourceNodes.has(node.id)) {
      nodesWithoutEdge.push(`${node.id} (${node.type})`);
    }
  }

  if (nodesWithoutEdge.length > 0) {
    return {
      name: "edge-connectivity",
      status: "failed",
      message: `Nodes without outgoing edges: ${nodesWithoutEdge.join(", ")}`,
      durationMs: Date.now() - start,
    };
  }

  return {
    name: "edge-connectivity",
    status: "passed",
    message: "All non-end nodes have outgoing edges",
    durationMs: Date.now() - start,
  };
}

// ── 5. Security Scan ─────────────────────────────────────────────────────────

function checkSecurityScan(flow: FlowContent): PostDeployCheck {
  const start = Date.now();

  if (process.env.SKIP_SECURITY_SCAN === "true") {
    return {
      name: "security-scan",
      status: "skipped",
      message: "Security scan skipped (SKIP_SECURITY_SCAN=true)",
      durationMs: Date.now() - start,
    };
  }

  const findings: string[] = [];

  for (const node of flow.nodes) {
    const strings = extractStringsFromData(node.data);
    for (const str of strings) {
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.test(str)) {
          findings.push(`Node ${node.id}: hardcoded secret detected`);
          break;
        }
      }
    }
  }

  if (findings.length > 0) {
    return {
      name: "security-scan",
      status: "failed",
      message: findings.join("; "),
      durationMs: Date.now() - start,
    };
  }

  return {
    name: "security-scan",
    status: "passed",
    message: "No hardcoded secrets found",
    durationMs: Date.now() - start,
  };
}

// ── 6. Agent Reachability ────────────────────────────────────────────────────

async function checkAgentReachability(
  flow: FlowContent,
  _agentId: string,
): Promise<PostDeployCheck> {
  const start = Date.now();

  const callAgentNodes = flow.nodes.filter((n) => n.type === "call_agent");
  if (callAgentNodes.length === 0) {
    return {
      name: "agent-reachability",
      status: "skipped",
      message: "No call_agent nodes in flow",
      durationMs: Date.now() - start,
    };
  }

  const targetIds = callAgentNodes
    .map((n) => n.data.targetAgentId as string | undefined)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  if (targetIds.length === 0) {
    return {
      name: "agent-reachability",
      status: "warning",
      message: "call_agent nodes have no targetAgentId configured",
      durationMs: Date.now() - start,
    };
  }

  try {
    const agents = await prisma.agent.findMany({
      where: { id: { in: targetIds } },
      select: { id: true },
    });

    const foundIds = new Set(agents.map((a) => a.id));
    const missing = targetIds.filter((id) => !foundIds.has(id));

    if (missing.length > 0) {
      return {
        name: "agent-reachability",
        status: "failed",
        message: `Referenced agents not found: ${missing.join(", ")}`,
        durationMs: Date.now() - start,
      };
    }

    return {
      name: "agent-reachability",
      status: "passed",
      message: `All ${targetIds.length} referenced agents exist`,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      name: "agent-reachability",
      status: "warning",
      message: `DB check failed: ${err instanceof Error ? err.message : "unknown error"}`,
      durationMs: Date.now() - start,
    };
  }
}
