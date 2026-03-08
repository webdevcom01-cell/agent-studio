import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  agentCallLog: {
    create: vi.fn(),
    update: vi.fn(),
  },
  agent: {
    findFirst: vi.fn(),
  },
  conversation: {
    create: vi.fn(),
  },
}));

const mockExecuteFlow = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("../../engine", () => ({
  executeFlow: mockExecuteFlow,
}));

import { callAgentHandler } from "../call-agent-handler";
import type { FlowNode } from "@/types";
import type { RuntimeContext } from "../../types";

function makeNode(data: Record<string, unknown>): FlowNode {
  return {
    id: "n1",
    type: "call_agent",
    position: { x: 0, y: 0 },
    data,
  };
}

function makeContext(overrides: Record<string, unknown> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-caller",
    flowContent: { nodes: [], edges: [], variables: [] },
    currentNodeId: "n1",
    variables: {},
    messageHistory: [],
    isNewConversation: false,
    ...overrides,
  } as RuntimeContext;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.agentCallLog.create.mockResolvedValue({ id: "log-1" });
  mockPrisma.agentCallLog.update.mockResolvedValue({});
  mockPrisma.conversation.create.mockResolvedValue({ id: "conv-sub" });
});

describe("callAgentHandler", () => {
  it("returns error when no targetAgentId configured", async () => {
    const result = await callAgentHandler(makeNode({}), makeContext());

    expect(result.messages[0].content).toContain("not configured");
    expect(result.waitForInput).toBe(false);
  });

  it("detects circular calls", async () => {
    const ctx = makeContext({
      _a2aCallStack: ["agent-caller", "agent-target"],
    });

    const result = await callAgentHandler(
      makeNode({ targetAgentId: "agent-caller", onError: "continue" }),
      ctx,
    );

    expect(result.messages[0].content).toContain("Circular");
    expect(result.updatedVariables).toEqual({ agent_result: null });
  });

  it("respects max depth limit", async () => {
    const ctx = makeContext({ _a2aDepth: 5 });

    const result = await callAgentHandler(
      makeNode({ targetAgentId: "agent-target", onError: "continue" }),
      ctx,
    );

    expect(result.messages[0].content).toContain("depth limit");
    expect(result.updatedVariables).toEqual({ agent_result: null });
  });

  it("stops flow on depth limit when onError is stop", async () => {
    const ctx = makeContext({ _a2aDepth: 5 });

    const result = await callAgentHandler(
      makeNode({ targetAgentId: "agent-target", onError: "stop" }),
      ctx,
    );

    expect(result.messages[0].content).toContain("Max agent call depth");
    expect(result.updatedVariables).toBeUndefined();
  });

  it("executes sub-agent and returns output", async () => {
    mockPrisma.agent.findFirst.mockResolvedValue({
      id: "agent-target",
      name: "Target",
      flow: { content: { nodes: [], edges: [], variables: [] } },
    });

    mockExecuteFlow.mockResolvedValue({
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "Sub-agent response" },
      ],
      waitingForInput: false,
    });

    const result = await callAgentHandler(
      makeNode({
        targetAgentId: "agent-target",
        outputVariable: "result",
      }),
      makeContext(),
    );

    expect(result.messages[0].content).toBe("Sub-agent response");
    expect(result.updatedVariables).toEqual({ result: "Sub-agent response" });
    expect(mockPrisma.agentCallLog.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.agentCallLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "COMPLETED" }),
      }),
    );
  });

  it("handles sub-agent not found", async () => {
    mockPrisma.agent.findFirst.mockResolvedValue(null);

    const result = await callAgentHandler(
      makeNode({
        targetAgentId: "nonexistent",
        onError: "continue",
      }),
      makeContext(),
    );

    expect(result.messages[0].content).toContain("failed");
    expect(result.updatedVariables).toEqual({ agent_result: null });
  });

  it("handles sub-agent with no flow", async () => {
    mockPrisma.agent.findFirst.mockResolvedValue({
      id: "agent-target",
      name: "Target",
      flow: null,
    });

    const result = await callAgentHandler(
      makeNode({
        targetAgentId: "agent-target",
        onError: "continue",
      }),
      makeContext(),
    );

    expect(result.messages[0].content).toContain("failed");
  });

  it("uses default outputVariable when not specified", async () => {
    mockPrisma.agent.findFirst.mockResolvedValue({
      id: "agent-target",
      name: "Target",
      flow: { content: { nodes: [], edges: [], variables: [] } },
    });

    mockExecuteFlow.mockResolvedValue({
      messages: [{ role: "assistant", content: "done" }],
      waitingForInput: false,
    });

    const result = await callAgentHandler(
      makeNode({ targetAgentId: "agent-target" }),
      makeContext(),
    );

    expect(result.updatedVariables).toEqual({ agent_result: "done" });
  });

  it("resolves input mapping templates", async () => {
    mockPrisma.agent.findFirst.mockResolvedValue({
      id: "agent-target",
      name: "Target",
      flow: { content: { nodes: [], edges: [], variables: [] } },
    });

    mockExecuteFlow.mockResolvedValue({
      messages: [{ role: "assistant", content: "ok" }],
      waitingForInput: false,
    });

    await callAgentHandler(
      makeNode({
        targetAgentId: "agent-target",
        inputMapping: [
          { key: "name", value: "{{user_name}}" },
          { key: "static", value: "hello" },
        ],
      }),
      makeContext({ variables: { user_name: "John" } }),
    );

    expect(mockPrisma.agentCallLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          inputParts: [
            { type: "text", text: expect.stringContaining("John") },
          ],
        }),
      }),
    );
  });

  it("normalizes Record-style input mapping", async () => {
    mockPrisma.agent.findFirst.mockResolvedValue({
      id: "agent-target",
      name: "Target",
      flow: { content: { nodes: [], edges: [], variables: [] } },
    });

    mockExecuteFlow.mockResolvedValue({
      messages: [{ role: "assistant", content: "ok" }],
      waitingForInput: false,
    });

    await callAgentHandler(
      makeNode({
        targetAgentId: "agent-target",
        inputMapping: { query: "test" },
      }),
      makeContext(),
    );

    expect(mockPrisma.agentCallLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          inputParts: [
            { type: "text", text: expect.stringContaining("test") },
          ],
        }),
      }),
    );
  });

  it("logs FAILED status on sub-agent error with stop mode", async () => {
    mockPrisma.agent.findFirst.mockResolvedValue({
      id: "agent-target",
      name: "Target",
      flow: { content: { nodes: [], edges: [], variables: [] } },
    });

    mockExecuteFlow.mockRejectedValue(new Error("Engine crash"));

    const result = await callAgentHandler(
      makeNode({
        targetAgentId: "agent-target",
        onError: "stop",
      }),
      makeContext(),
    );

    expect(result.messages[0].content).toContain("Engine crash");
    expect(mockPrisma.agentCallLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
  });
});
