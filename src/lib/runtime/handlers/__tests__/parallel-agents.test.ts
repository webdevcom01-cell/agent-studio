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

vi.mock("@/lib/a2a/circuit-breaker", () => ({
  checkCircuit: vi.fn(),
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
}));

vi.mock("@/lib/a2a/rate-limiter", () => ({
  checkRateLimit: vi.fn(),
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

function makeAgentResponse() {
  return {
    id: "agent-target",
    name: "Target",
    flow: { content: { nodes: [], edges: [], variables: [] } },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.agentCallLog.create.mockResolvedValue({ id: "log-1" });
  mockPrisma.agentCallLog.update.mockResolvedValue({});
  mockPrisma.conversation.create.mockResolvedValue({ id: "conv-sub" });
});

describe("Parallel agent calls", () => {
  it("executes multiple agents concurrently", async () => {
    mockPrisma.agent.findFirst.mockResolvedValue(makeAgentResponse());
    mockExecuteFlow.mockResolvedValue({
      messages: [{ role: "assistant", content: "result" }],
      waitingForInput: false,
    });

    const result = await callAgentHandler(
      makeNode({
        allowParallel: true,
        parallelTargets: [
          { agentId: "a1", agentName: "Agent 1", outputVariable: "res1", inputMapping: [] },
          { agentId: "a2", agentName: "Agent 2", outputVariable: "res2", inputMapping: [] },
        ],
      }),
      makeContext(),
    );

    expect(result.updatedVariables?.res1).toBe("result");
    expect(result.updatedVariables?.res2).toBe("result");
    expect(mockExecuteFlow).toHaveBeenCalledTimes(2);
  });

  it("stores each result in correct output variable", async () => {
    mockPrisma.agent.findFirst.mockResolvedValue(makeAgentResponse());

    mockExecuteFlow.mockImplementation((ctx: { agentId: string }) => {
      const answer = ctx.agentId === "a1" ? "answer-1" : "answer-2";
      return Promise.resolve({
        messages: [{ role: "assistant", content: answer }],
        waitingForInput: false,
      });
    });

    const result = await callAgentHandler(
      makeNode({
        allowParallel: true,
        parallelTargets: [
          { agentId: "a1", outputVariable: "var1", inputMapping: [] },
          { agentId: "a2", outputVariable: "var2", inputMapping: [] },
        ],
      }),
      makeContext(),
    );

    expect(result.updatedVariables?.var1).toBe("answer-1");
    expect(result.updatedVariables?.var2).toBe("answer-2");
  });

  it("continues when one agent fails and onError=continue", async () => {
    mockPrisma.agent.findFirst
      .mockResolvedValueOnce(makeAgentResponse())
      .mockResolvedValueOnce(null);

    mockExecuteFlow.mockResolvedValueOnce({
      messages: [{ role: "assistant", content: "success" }],
      waitingForInput: false,
    });

    const result = await callAgentHandler(
      makeNode({
        allowParallel: true,
        onError: "continue",
        parallelTargets: [
          { agentId: "a1", agentName: "Good", outputVariable: "good", inputMapping: [] },
          { agentId: "a2", agentName: "Bad", outputVariable: "bad", inputMapping: [] },
        ],
      }),
      makeContext(),
    );

    expect(result.updatedVariables?.good).toBe("success");
    expect(result.updatedVariables?.bad).toBeNull();
    expect(result.messages[0].content).toContain("complete");
  });

  it("stops all when one agent fails and onError=stop", async () => {
    mockPrisma.agent.findFirst
      .mockResolvedValueOnce(makeAgentResponse())
      .mockResolvedValueOnce(null);

    mockExecuteFlow.mockResolvedValueOnce({
      messages: [{ role: "assistant", content: "success" }],
      waitingForInput: false,
    });

    const result = await callAgentHandler(
      makeNode({
        allowParallel: true,
        onError: "stop",
        parallelTargets: [
          { agentId: "a1", outputVariable: "r1", inputMapping: [] },
          { agentId: "a2", outputVariable: "r2", inputMapping: [] },
        ],
      }),
      makeContext(),
    );

    expect(result.messages[0].content).toContain("failed");
  });

  it("all get same traceId, isParallel=true in logs", async () => {
    mockPrisma.agent.findFirst.mockResolvedValue(makeAgentResponse());
    mockExecuteFlow.mockResolvedValue({
      messages: [{ role: "assistant", content: "ok" }],
      waitingForInput: false,
    });

    await callAgentHandler(
      makeNode({
        allowParallel: true,
        parallelTargets: [
          { agentId: "a1", outputVariable: "r1", inputMapping: [] },
          { agentId: "a2", outputVariable: "r2", inputMapping: [] },
        ],
      }),
      makeContext(),
    );

    const createCalls = mockPrisma.agentCallLog.create.mock.calls;
    expect(createCalls).toHaveLength(2);

    const traceId1 = createCalls[0][0].data.traceId;
    const traceId2 = createCalls[1][0].data.traceId;
    expect(traceId1).toBe(traceId2);

    expect(createCalls[0][0].data.isParallel).toBe(true);
    expect(createCalls[1][0].data.isParallel).toBe(true);
  });
});
