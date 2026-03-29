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

const MockA2ACircuitError = vi.hoisted(() => {
  return class extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = "A2ACircuitError";
      this.code = code;
    }
  };
});

vi.mock("@/lib/a2a/circuit-breaker", () => ({
  checkCircuit: vi.fn(),
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
  checkDepthLimit: vi.fn((depth: number) => {
    if (depth >= 3) throw new MockA2ACircuitError("DEPTH_LIMIT", "Max agent call depth exceeded");
  }),
  checkCycleDetection: vi.fn((targetId: string, callStack: string[]) => {
    if (callStack.includes(targetId)) throw new MockA2ACircuitError("CYCLE_DETECTED", "Circular agent call detected");
  }),
  A2ACircuitError: MockA2ACircuitError,
  MAX_AGENT_DEPTH: 3,
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
    const ctx = makeContext({ _a2aDepth: 10 });

    const result = await callAgentHandler(
      makeNode({ targetAgentId: "agent-target", onError: "continue" }),
      ctx,
    );

    expect(result.messages[0].content).toContain("Max agent call depth");
    expect(result.updatedVariables).toEqual({ agent_result: null });
  });

  it("stops flow on depth limit when onError is stop", async () => {
    const ctx = makeContext({ _a2aDepth: 10 });

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

  // ── Input mapping validation (P-09) ──────────────────────────────────

  describe("inputMapping validation", () => {
    it("warns when inputMapping is undefined", async () => {
      const { logger } = await import("@/lib/logger");
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
        makeNode({ targetAgentId: "agent-target" }),
        makeContext(),
      );

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("no inputMapping"),
        expect.objectContaining({ targetAgentId: "agent-target" }),
      );
    });

    it("warns when inputMapping is empty array", async () => {
      const { logger } = await import("@/lib/logger");
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
        makeNode({ targetAgentId: "agent-target", inputMapping: [] }),
        makeContext(),
      );

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("no inputMapping"),
        expect.anything(),
      );
    });

    it("logs mapped keys when inputMapping is provided", async () => {
      const { logger } = await import("@/lib/logger");
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
            { key: "pr_diff", value: "{{diff}}" },
            { key: "context", value: "static_value" },
          ],
        }),
        makeContext({ variables: { diff: "file changes here" } }),
      );

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("passing variables"),
        expect.objectContaining({ mappedKeys: ["pr_diff", "context"] }),
      );
    });

    it("resolves template variables in inputMapping values", async () => {
      mockPrisma.agent.findFirst.mockResolvedValue({
        id: "agent-target",
        name: "Target",
        flow: { content: { nodes: [], edges: [], variables: [] } },
      });
      mockExecuteFlow.mockResolvedValue({
        messages: [{ role: "assistant", content: "analyzed" }],
        waitingForInput: false,
      });

      await callAgentHandler(
        makeNode({
          targetAgentId: "agent-target",
          inputMapping: [
            { key: "code", value: "{{pr_diff}}" },
          ],
        }),
        makeContext({ variables: { pr_diff: "diff content" } }),
      );

      // Sub-agent context should receive the resolved value
      expect(mockExecuteFlow).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: expect.objectContaining({ code: "diff content" }),
        }),
      );
    });

    it("resolves nested JSON template via P-02 fallback", async () => {
      mockPrisma.agent.findFirst.mockResolvedValue({
        id: "agent-target",
        name: "Target",
        flow: { content: { nodes: [], edges: [], variables: [] } },
      });
      mockExecuteFlow.mockResolvedValue({
        messages: [{ role: "assistant", content: "done" }],
        waitingForInput: false,
      });

      await callAgentHandler(
        makeNode({
          targetAgentId: "agent-target",
          inputMapping: [
            { key: "decision", value: "{{assessment.verdict}}" },
          ],
        }),
        makeContext({
          variables: {
            assessment: '{"verdict":"APPROVE","score":90}',
          },
        }),
      );

      expect(mockExecuteFlow).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: expect.objectContaining({ decision: "APPROVE" }),
        }),
      );
    });

    it("sub-agent receives ONLY inputMapping variables, not parent context", async () => {
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
          inputMapping: [{ key: "x", value: "hello" }],
        }),
        makeContext({
          variables: {
            secret_key: "should_not_leak",
            parent_data: "parent_only",
          },
        }),
      );

      const subContext = mockExecuteFlow.mock.calls[0][0] as Record<string, unknown>;
      const subVars = subContext.variables as Record<string, unknown>;
      expect(subVars.x).toBe("hello");
      expect(subVars.secret_key).toBeUndefined();
      expect(subVars.parent_data).toBeUndefined();
    });
  });

  // ── Built-in retry (F-01) ────────────────────────────────────────────────

  describe("retry with exponential backoff (F-01)", () => {
    function makeAgentAvailable() {
      mockPrisma.agent.findFirst.mockResolvedValue({
        id: "agent-target",
        name: "Target",
        flow: { content: { nodes: [], edges: [], variables: [] } },
      });
    }

    it("executes once without retryConfig (backward compat)", async () => {
      makeAgentAvailable();
      mockExecuteFlow.mockResolvedValue({
        messages: [{ role: "assistant", content: "ok" }],
        waitingForInput: false,
      });

      const result = await callAgentHandler(
        makeNode({ targetAgentId: "agent-target" }),
        makeContext(),
      );

      expect(result.messages[0].content).toBe("ok");
      expect(mockExecuteFlow).toHaveBeenCalledTimes(1);
    });

    it("executes once with maxRetries: 0", async () => {
      makeAgentAvailable();
      mockExecuteFlow.mockResolvedValue({
        messages: [{ role: "assistant", content: "ok" }],
        waitingForInput: false,
      });

      const result = await callAgentHandler(
        makeNode({
          targetAgentId: "agent-target",
          retryConfig: { maxRetries: 0 },
        }),
        makeContext(),
      );

      expect(result.messages[0].content).toBe("ok");
      expect(mockExecuteFlow).toHaveBeenCalledTimes(1);
    });

    it("retries on failure and succeeds on 2nd attempt", async () => {
      makeAgentAvailable();
      mockExecuteFlow
        .mockRejectedValueOnce(new Error("timeout"))
        .mockResolvedValueOnce({
          messages: [{ role: "assistant", content: "ok" }],
          waitingForInput: false,
        });

      const result = await callAgentHandler(
        makeNode({
          targetAgentId: "agent-target",
          retryConfig: { maxRetries: 3, initialDelayMs: 10, jitter: false },
        }),
        makeContext(),
      );

      expect(result.messages[0].content).toBe("ok");
    });

    it("logs each retry attempt", async () => {
      const { logger } = await import("@/lib/logger");
      makeAgentAvailable();
      mockExecuteFlow
        .mockRejectedValueOnce(new Error("timeout"))
        .mockResolvedValueOnce({
          messages: [{ role: "assistant", content: "ok" }],
          waitingForInput: false,
        });

      await callAgentHandler(
        makeNode({
          targetAgentId: "agent-target",
          retryConfig: { maxRetries: 3, initialDelayMs: 10, jitter: false },
        }),
        makeContext(),
      );

      expect(logger.info).toHaveBeenCalledWith(
        "call_agent retry",
        expect.objectContaining({ attempt: 1 }),
      );
    });

    it("returns error after all retries exhausted", async () => {
      makeAgentAvailable();
      mockExecuteFlow.mockRejectedValue(new Error("timeout"));

      const result = await callAgentHandler(
        makeNode({
          targetAgentId: "agent-target",
          retryConfig: { maxRetries: 2, initialDelayMs: 10, jitter: false },
          onError: "continue",
        }),
        makeContext(),
      );

      expect(result.messages[0].content).toContain("failed");
    });

    it("does not retry non-retryable errors", async () => {
      makeAgentAvailable();
      mockExecuteFlow.mockRejectedValueOnce(new Error("Agent not found"));

      const result = await callAgentHandler(
        makeNode({
          targetAgentId: "agent-target",
          retryConfig: { maxRetries: 3, initialDelayMs: 10 },
          onError: "continue",
        }),
        makeContext(),
      );

      // Should not retry — "not found" is not in retryable patterns
      expect(result.messages[0].content).toContain("failed");
      // Only 1 call to executeFlow (the initial attempt)
      expect(mockPrisma.agentCallLog.create).toHaveBeenCalledTimes(1);
    });

    it("caps maxRetries at 5", async () => {
      const { logger } = await import("@/lib/logger");
      makeAgentAvailable();
      mockExecuteFlow.mockRejectedValue(new Error("timeout"));

      await callAgentHandler(
        makeNode({
          targetAgentId: "agent-target",
          retryConfig: { maxRetries: 10, initialDelayMs: 10, jitter: false },
          onError: "continue",
        }),
        makeContext(),
      );

      // maxRetries capped at 5 — verify via retry log count (attempts 1-5)
      const retryCalls = (logger.info as ReturnType<typeof vi.fn>).mock.calls
        .filter((c) => c[0] === "call_agent retry");
      expect(retryCalls).toHaveLength(5);
    });
  });
});
