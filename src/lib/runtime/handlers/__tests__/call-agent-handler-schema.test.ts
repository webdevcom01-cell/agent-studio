import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  agent: { findFirst: vi.fn() },
  agentCallLog: { create: vi.fn(), update: vi.fn() },
  conversation: { create: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/a2a/circuit-breaker", () => ({
  checkCircuit: vi.fn(),
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
  checkDepthLimit: vi.fn(),
  checkCycleDetection: vi.fn(),
  A2ACircuitError: class extends Error {},
}));

vi.mock("@/lib/a2a/rate-limiter", () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/safety/audit-logger", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/agents/agent-workspace", () => ({
  createWorkspace: vi.fn().mockResolvedValue({ basePath: "/tmp/ws" }),
  shareWorkspace: vi.fn().mockImplementation((ws: unknown) => ws),
  getFiles: vi.fn().mockResolvedValue([]),
}));

const mockExecuteFlow = vi.hoisted(() => vi.fn());

vi.mock("../../engine", () => ({
  executeFlow: mockExecuteFlow,
}));

vi.mock("@/lib/validators/flow-content", () => ({
  parseFlowContent: vi.fn().mockReturnValue({ nodes: [], edges: [] }),
}));

import { callAgentHandler } from "../call-agent-handler";
import type { FlowNode } from "@/types";
import type { RuntimeContext } from "../../types";

function makeNode(data: Record<string, unknown>): FlowNode {
  return { id: "n1", type: "call_agent", position: { x: 0, y: 0 }, data };
}

function makeContext(variables: Record<string, unknown> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "caller-agent",
    flowContent: { nodes: [], edges: [], variables: [] },
    currentNodeId: "n1",
    variables,
    messageHistory: [],
    isNewConversation: false,
  } as unknown as RuntimeContext;
}

beforeEach(() => {
  vi.clearAllMocks();

  mockPrisma.agent.findFirst.mockResolvedValue({
    id: "target-agent",
    name: "Target",
    flow: { content: {} },
  });
  mockPrisma.agentCallLog.create.mockResolvedValue({ id: "log-1" });
  mockPrisma.agentCallLog.update.mockResolvedValue({});
  mockPrisma.conversation.create.mockResolvedValue({ id: "conv-2" });

  mockExecuteFlow.mockResolvedValue({
    messages: [{ role: "assistant", content: '{"decision":"APPROVE","compositeScore":90,"securityScore":95,"qualityScore":85,"issues":[],"summary":"ok"}' }],
    waitingForInput: false,
  });
});

describe("callAgentHandler — schema enforcement (6.2)", () => {
  it("validates input schema before calling sub-agent — rejects invalid input", async () => {
    const result = await callAgentHandler(
      makeNode({
        mode: "internal",
        targetAgentId: "target-agent",
        inputMapping: [{ key: "data", value: "no-files-field" }],
        outputVariable: "result",
        inputSchema: "CodeGenOutput",
      }),
      makeContext(),
    );

    expect(result.messages[0].content).toContain("does not match schema");
    expect(result.messages[0].content).toContain("CodeGenOutput");
    expect(mockExecuteFlow).not.toHaveBeenCalled();
  });

  it("allows call when no inputSchema is set (backward compat)", async () => {
    const result = await callAgentHandler(
      makeNode({
        mode: "internal",
        targetAgentId: "target-agent",
        inputMapping: [],
        outputVariable: "result",
      }),
      makeContext(),
    );

    expect(mockExecuteFlow).toHaveBeenCalled();
    expect(result.updatedVariables?.result).toBeDefined();
  });

  it("validates output schema after sub-agent completes — rejects invalid output", async () => {
    mockExecuteFlow.mockResolvedValue({
      messages: [{ role: "assistant", content: '{"bad":"shape"}' }],
      waitingForInput: false,
    });

    const result = await callAgentHandler(
      makeNode({
        mode: "internal",
        targetAgentId: "target-agent",
        inputMapping: [],
        outputVariable: "gateResult",
        outputSchema: "PRGateOutput",
      }),
      makeContext(),
    );

    expect(result.messages[0].content).toContain("does not match schema");
    expect(result.messages[0].content).toContain("PRGateOutput");
    expect(result.updatedVariables?.gateResult).toBeNull();
  });

  it("passes when sub-agent output matches the outputSchema — no schema error message", async () => {
    mockExecuteFlow.mockResolvedValue({
      messages: [
        {
          role: "assistant",
          content: JSON.stringify({
            decision: "APPROVE",
            compositeScore: 90,
            securityScore: 95,
            qualityScore: 85,
            issues: [],
            summary: "All good",
          }),
        },
      ],
      waitingForInput: false,
    });

    const result = await callAgentHandler(
      makeNode({
        mode: "internal",
        targetAgentId: "target-agent",
        inputMapping: [],
        outputVariable: "gateResult",
        outputSchema: "PRGateOutput",
      }),
      makeContext(),
    );

    // When schema passes, messages should NOT contain a schema-validation error
    const msg = result.messages[0]?.content ?? "";
    expect(msg).not.toContain("does not match schema");
  });

  it("returns clear message when agent B output schema mismatches agent A's expectation", async () => {
    mockExecuteFlow.mockResolvedValue({
      messages: [{ role: "assistant", content: "plain text response" }],
      waitingForInput: false,
    });

    const result = await callAgentHandler(
      makeNode({
        mode: "internal",
        targetAgentId: "target-agent",
        inputMapping: [],
        outputVariable: "result",
        outputSchema: "CodeGenOutput",
      }),
      makeContext(),
    );

    expect(result.messages[0].content).toContain("Agent output does not match schema");
    expect(result.messages[0].content).toContain("CodeGenOutput");
  });
});
