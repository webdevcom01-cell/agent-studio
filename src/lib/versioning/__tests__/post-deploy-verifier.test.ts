import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agent: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock handler registry — all standard types have handlers
vi.mock("@/lib/runtime/handlers", () => ({
  getHandler: (type: string) => {
    const known = new Set([
      "message", "end", "condition", "ai_response", "call_agent",
      "webhook_trigger", "schedule_trigger", "set_variable", "switch",
    ]);
    return known.has(type) ? vi.fn() : null;
  },
}));

import { verifyDeployment } from "../post-deploy-verifier";
import type { FlowContent, FlowNode, FlowEdge } from "@/types";

function n(id: string, type: string, data: Record<string, unknown> = {}): FlowNode {
  return { id, type: type as FlowNode["type"], position: { x: 0, y: 0 }, data };
}

function e(id: string, source: string, target: string, sourceHandle?: string): FlowEdge {
  return { id, source, target, ...(sourceHandle ? { sourceHandle } : {}) };
}

function makeFlow(
  nodes: FlowNode[],
  edges: FlowEdge[],
  variables: FlowContent["variables"] = [],
): FlowContent {
  return { nodes, edges, variables };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SKIP_SECURITY_SCAN", "");
});

describe("verifyDeployment", () => {
  // ── Flow Integrity ────────────────────────────────────────────────────

  it("passes with valid start and end nodes", async () => {
    const flow = makeFlow(
      [n("m1", "message"), n("e1", "end")],
      [e("edge1", "m1", "e1")],
    );
    const result = await verifyDeployment(flow, "agent-1");
    const check = result.checks.find((c) => c.name === "flow-integrity");
    expect(check?.status).toBe("passed");
  });

  it("fails when no start node", async () => {
    const flow = makeFlow(
      [n("c1", "condition"), n("e1", "end")],
      [e("edge1", "c1", "e1")],
    );
    const result = await verifyDeployment(flow, "agent-1");
    const check = result.checks.find((c) => c.name === "flow-integrity");
    expect(check?.status).toBe("failed");
    expect(check?.message).toContain("no start node");
  });

  it("fails when no end node", async () => {
    const flow = makeFlow(
      [n("m1", "message"), n("m2", "message")],
      [e("edge1", "m1", "m2")],
    );
    const result = await verifyDeployment(flow, "agent-1");
    const check = result.checks.find((c) => c.name === "flow-integrity");
    expect(check?.status).toBe("failed");
    expect(check?.message).toContain("no end node");
  });

  // ── Handler Coverage ──────────────────────────────────────────────────

  it("passes when all node types have handlers", async () => {
    const flow = makeFlow(
      [n("m1", "message"), n("e1", "end")],
      [e("edge1", "m1", "e1")],
    );
    const result = await verifyDeployment(flow, "agent-1");
    const check = result.checks.find((c) => c.name === "handler-coverage");
    expect(check?.status).toBe("passed");
  });

  it("fails for unregistered node type", async () => {
    const flow = makeFlow(
      [n("m1", "message"), n("x1", "nonexistent_type" as FlowNode["type"]), n("e1", "end")],
      [e("e1", "m1", "x1"), e("e2", "x1", "e1")],
    );
    const result = await verifyDeployment(flow, "agent-1");
    const check = result.checks.find((c) => c.name === "handler-coverage");
    expect(check?.status).toBe("failed");
    expect(check?.message).toContain("nonexistent_type");
  });

  // ── Variable References ───────────────────────────────────────────────

  it("passes when all variables are defined", async () => {
    const flow = makeFlow(
      [n("m1", "message", { message: "Hello {{name}}" }), n("e1", "end")],
      [e("edge1", "m1", "e1")],
      [{ name: "name", type: "string", default: "" }],
    );
    const result = await verifyDeployment(flow, "agent-1");
    const check = result.checks.find((c) => c.name === "variable-references");
    expect(check?.status).toBe("passed");
  });

  it("fails for undefined variable references", async () => {
    const flow = makeFlow(
      [n("m1", "message", { message: "Hello {{undefined_var}}" }), n("e1", "end")],
      [e("edge1", "m1", "e1")],
    );
    const result = await verifyDeployment(flow, "agent-1");
    const check = result.checks.find((c) => c.name === "variable-references");
    expect(check?.status).toBe("failed");
    expect(check?.message).toContain("undefined_var");
  });

  it("warns for runtime-injected __ variables", async () => {
    const flow = makeFlow(
      [n("m1", "message", { message: "Payload: {{__webhook_payload}}" }), n("e1", "end")],
      [e("edge1", "m1", "e1")],
    );
    const result = await verifyDeployment(flow, "agent-1");
    const check = result.checks.find((c) => c.name === "variable-references");
    expect(check?.status).toBe("warning");
  });

  // ── Edge Connectivity ─────────────────────────────────────────────────

  it("passes when all non-end nodes have outgoing edges", async () => {
    const flow = makeFlow(
      [n("m1", "message"), n("e1", "end")],
      [e("edge1", "m1", "e1")],
    );
    const result = await verifyDeployment(flow, "agent-1");
    const check = result.checks.find((c) => c.name === "edge-connectivity");
    expect(check?.status).toBe("passed");
  });

  it("fails when non-end node has no outgoing edge", async () => {
    const flow = makeFlow(
      [n("m1", "message"), n("m2", "message"), n("e1", "end")],
      [e("edge1", "m1", "e1")],
      // m2 has no outgoing edge
    );
    const result = await verifyDeployment(flow, "agent-1");
    const check = result.checks.find((c) => c.name === "edge-connectivity");
    expect(check?.status).toBe("failed");
    expect(check?.message).toContain("m2");
  });

  // ── Security Scan ─────────────────────────────────────────────────────

  it("passes when no secrets found", async () => {
    const flow = makeFlow(
      [n("m1", "message", { message: "safe content" }), n("e1", "end")],
      [e("edge1", "m1", "e1")],
    );
    const result = await verifyDeployment(flow, "agent-1");
    const check = result.checks.find((c) => c.name === "security-scan");
    expect(check?.status).toBe("passed");
  });

  it("fails when hardcoded secret detected", async () => {
    const flow = makeFlow(
      [n("m1", "message", { apiKey: "sk-abcdefghijklmnopqrstuvwxyz1234567890" }), n("e1", "end")],
      [e("edge1", "m1", "e1")],
    );
    const result = await verifyDeployment(flow, "agent-1");
    const check = result.checks.find((c) => c.name === "security-scan");
    expect(check?.status).toBe("failed");
    expect(check?.message).toContain("hardcoded secret");
  });

  it("detects GitHub PAT", async () => {
    const flow = makeFlow(
      [n("m1", "message", { token: "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij" }), n("e1", "end")],
      [e("edge1", "m1", "e1")],
    );
    const result = await verifyDeployment(flow, "agent-1");
    const check = result.checks.find((c) => c.name === "security-scan");
    expect(check?.status).toBe("failed");
  });

  it("detects AWS key", async () => {
    const flow = makeFlow(
      [n("m1", "message", { key: "AKIAIOSFODNN7EXAMPLE" }), n("e1", "end")],
      [e("edge1", "m1", "e1")],
    );
    const result = await verifyDeployment(flow, "agent-1");
    const check = result.checks.find((c) => c.name === "security-scan");
    expect(check?.status).toBe("failed");
  });

  it("skips security scan when SKIP_SECURITY_SCAN=true", async () => {
    vi.stubEnv("SKIP_SECURITY_SCAN", "true");

    const flow = makeFlow(
      [n("m1", "message", { apiKey: "sk-proj-secret123456789012345" }), n("e1", "end")],
      [e("edge1", "m1", "e1")],
    );
    const result = await verifyDeployment(flow, "agent-1");
    const check = result.checks.find((c) => c.name === "security-scan");
    expect(check?.status).toBe("skipped");
  });

  // ── Agent Reachability ────────────────────────────────────────────────

  it("skips when no call_agent nodes", async () => {
    const flow = makeFlow(
      [n("m1", "message"), n("e1", "end")],
      [e("edge1", "m1", "e1")],
    );
    const result = await verifyDeployment(flow, "agent-1");
    const check = result.checks.find((c) => c.name === "agent-reachability");
    expect(check?.status).toBe("skipped");
  });

  it("passes when all referenced agents exist", async () => {
    mockFindMany.mockResolvedValueOnce([{ id: "target-agent" }]);

    const flow = makeFlow(
      [
        n("m1", "message"),
        n("ca1", "call_agent", { targetAgentId: "target-agent" }),
        n("e1", "end"),
      ],
      [e("e1", "m1", "ca1"), e("e2", "ca1", "e1")],
    );
    const result = await verifyDeployment(flow, "agent-1");
    const check = result.checks.find((c) => c.name === "agent-reachability");
    expect(check?.status).toBe("passed");
  });

  it("fails when referenced agent not found", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    const flow = makeFlow(
      [
        n("m1", "message"),
        n("ca1", "call_agent", { targetAgentId: "missing-agent" }),
        n("e1", "end"),
      ],
      [e("e1", "m1", "ca1"), e("e2", "ca1", "e1")],
    );
    const result = await verifyDeployment(flow, "agent-1");
    const check = result.checks.find((c) => c.name === "agent-reachability");
    expect(check?.status).toBe("failed");
    expect(check?.message).toContain("missing-agent");
  });

  // ── Overall result ────────────────────────────────────────────────────

  it("returns passed:true when all checks pass", async () => {
    const flow = makeFlow(
      [n("m1", "message"), n("e1", "end")],
      [e("edge1", "m1", "e1")],
    );
    const result = await verifyDeployment(flow, "agent-1");
    expect(result.passed).toBe(true);
    expect(result.failedChecks).toHaveLength(0);
    expect(result.summary).toContain("/6");
  });

  it("returns passed:false when any check fails", async () => {
    const flow = makeFlow([], []);
    const result = await verifyDeployment(flow, "agent-1");
    expect(result.passed).toBe(false);
    expect(result.failedChecks.length).toBeGreaterThan(0);
  });

  it("includes duration in result", async () => {
    const flow = makeFlow(
      [n("m1", "message"), n("e1", "end")],
      [e("edge1", "m1", "e1")],
    );
    const result = await verifyDeployment(flow, "agent-1");
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });
});
