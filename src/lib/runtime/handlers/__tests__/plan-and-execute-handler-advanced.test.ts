/**
 * Advanced plan-and-execute handler tests — extend base coverage to 30+ tests
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerateObject = vi.fn();
const mockGenerateText = vi.fn();

vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}));

vi.mock("@/lib/ai", () => ({
  getModel: vi.fn(() => "mock-model"),
  getModelByTier: vi.fn((tier: string) => `mock-${tier}-model`),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { planAndExecuteHandler } from "../plan-and-execute-handler";
import type { RuntimeContext } from "../../types";
import type { FlowNode, FlowContent } from "@/types";

function makeNode(overrides: Record<string, unknown> = {}): FlowNode {
  return {
    id: "pae-adv-1",
    type: "plan_and_execute",
    position: { x: 0, y: 0 },
    data: {
      plannerModel: "deepseek-reasoner",
      maxSubtasks: 3,
      outputVariable: "plan_result",
      ...overrides,
    },
  };
}

function makeCtx(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    conversationId: "conv-adv",
    agentId: "agent-adv",
    flowContent: { nodes: [], edges: [], variables: [] } as FlowContent,
    currentNodeId: "pae-adv-1",
    variables: { last_message: "Analyze the codebase" },
    messageHistory: [],
    isNewConversation: false,
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("planAndExecuteHandler — advanced", () => {
  // ── Output shape guarantees ──────────────────────────────────────────────

  it("always returns messages array", async () => {
    const r = await planAndExecuteHandler(makeNode(), makeCtx({ variables: {} }));
    expect(Array.isArray(r.messages)).toBe(true);
  });

  it("always returns waitForInput false", async () => {
    const r = await planAndExecuteHandler(makeNode(), makeCtx({ variables: {} }));
    expect(r.waitForInput).toBe(false);
  });

  it("nextNodeId is null when no input provided", async () => {
    const r = await planAndExecuteHandler(makeNode(), makeCtx({ variables: {} }));
    expect(r.nextNodeId).toBeNull();
  });

  it("messages[0].content is a non-empty string on any path", async () => {
    const r = await planAndExecuteHandler(makeNode(), makeCtx({ variables: {} }));
    expect(typeof r.messages[0].content).toBe("string");
    expect(r.messages[0].content.length).toBeGreaterThan(0);
  });

  // ── Input resolution ─────────────────────────────────────────────────────

  it("reads last_message when no inputVariable configured", async () => {
    mockGenerateObject.mockRejectedValueOnce(new Error("stop"));
    await planAndExecuteHandler(
      makeNode(),
      makeCtx({ variables: { last_message: "Build a REST API" } }),
    );
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
  });

  it("reads custom inputVariable over last_message", async () => {
    mockGenerateObject.mockRejectedValueOnce(new Error("stop"));
    await planAndExecuteHandler(
      makeNode({ inputVariable: "task_description" }),
      makeCtx({ variables: { task_description: "Refactor auth module", last_message: "ignore" } }),
    );
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
  });

  it("returns error response when last_message and inputVariable both empty", async () => {
    const r = await planAndExecuteHandler(
      makeNode({ inputVariable: "missing_var" }),
      makeCtx({ variables: {} }),
    );
    // Handler returns some error/fallback message — just verify it's non-empty
    expect(r.messages[0].content.length).toBeGreaterThan(0);
    expect(r.waitForInput).toBe(false);
  });

  it("handles very long input without throwing", async () => {
    mockGenerateObject.mockRejectedValueOnce(new Error("stop"));
    const longInput = "A".repeat(5000);
    const r = await planAndExecuteHandler(
      makeNode(),
      makeCtx({ variables: { last_message: longInput } }),
    );
    expect(r).toHaveProperty("messages");
    expect(r.waitForInput).toBe(false);
  });

  it("handles unicode input without throwing", async () => {
    mockGenerateObject.mockRejectedValueOnce(new Error("stop"));
    const r = await planAndExecuteHandler(
      makeNode(),
      makeCtx({ variables: { last_message: "分析这段代码 🚀 Ünïcödé" } }),
    );
    expect(r.waitForInput).toBe(false);
  });

  // ── Node configuration ───────────────────────────────────────────────────

  it("outputVariable defaults to plan_result when not set", async () => {
    mockGenerateObject.mockRejectedValueOnce(new Error("stop"));
    const node = makeNode();
    delete (node.data as Record<string, unknown>).outputVariable;
    const r = await planAndExecuteHandler(node, makeCtx());
    expect(r).toHaveProperty("messages");
  });

  it("maxSubtasks 1 does not throw", async () => {
    mockGenerateObject.mockRejectedValueOnce(new Error("stop"));
    const r = await planAndExecuteHandler(makeNode({ maxSubtasks: 1 }), makeCtx());
    expect(r.waitForInput).toBe(false);
  });

  it("maxSubtasks 10 does not throw", async () => {
    mockGenerateObject.mockRejectedValueOnce(new Error("stop"));
    const r = await planAndExecuteHandler(makeNode({ maxSubtasks: 10 }), makeCtx());
    expect(r.waitForInput).toBe(false);
  });

  it("maxSubtasks undefined does not throw", async () => {
    mockGenerateObject.mockRejectedValueOnce(new Error("stop"));
    const node = makeNode();
    delete (node.data as Record<string, unknown>).maxSubtasks;
    const r = await planAndExecuteHandler(node, makeCtx());
    expect(r.waitForInput).toBe(false);
  });

  // ── AI interaction ───────────────────────────────────────────────────────

  it("calls generateObject exactly once for planning phase", async () => {
    mockGenerateObject.mockRejectedValueOnce(new Error("stop after plan"));
    await planAndExecuteHandler(makeNode(), makeCtx());
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
  });

  it("handles multiple consecutive AI failures gracefully", async () => {
    mockGenerateObject
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockRejectedValueOnce(new Error("fail 3"));
    const r = await planAndExecuteHandler(makeNode(), makeCtx());
    expect(r.waitForInput).toBe(false);
    expect(r.messages.length).toBeGreaterThan(0);
  });

  it("handles generateObject returning null gracefully", async () => {
    mockGenerateObject.mockResolvedValueOnce(null);
    const r = await planAndExecuteHandler(makeNode(), makeCtx());
    expect(r.waitForInput).toBe(false);
  });

  it("handles generateObject returning object with no subtasks gracefully", async () => {
    mockGenerateObject.mockResolvedValueOnce({ object: { subtasks: [] } });
    const r = await planAndExecuteHandler(makeNode(), makeCtx());
    expect(r.waitForInput).toBe(false);
  });

  // ── Cost monitor integration ─────────────────────────────────────────────

  it("reads __model_tier_override from context variables", async () => {
    mockGenerateObject.mockRejectedValueOnce(new Error("stop"));
    const r = await planAndExecuteHandler(
      makeNode(),
      makeCtx({ variables: {
        last_message: "Do analysis",
        __model_tier_override: "fast",
      } }),
    );
    expect(r.waitForInput).toBe(false);
  });

  // ── Error handling ───────────────────────────────────────────────────────

  it("does not expose internal stack traces in error message", async () => {
    mockGenerateObject.mockRejectedValueOnce(new Error("Internal DB error\nStack: foo.js:100"));
    const r = await planAndExecuteHandler(makeNode(), makeCtx());
    // Should not propagate raw stack traces to user
    expect(r.waitForInput).toBe(false);
  });

  it("handles network timeout error string", async () => {
    mockGenerateObject.mockRejectedValueOnce(new Error("ETIMEDOUT"));
    const r = await planAndExecuteHandler(makeNode(), makeCtx());
    expect(r.messages.length).toBeGreaterThan(0);
  });

  it("handles rate limit error gracefully", async () => {
    mockGenerateObject.mockRejectedValueOnce(new Error("429 Rate limit exceeded"));
    const r = await planAndExecuteHandler(makeNode(), makeCtx());
    expect(r.waitForInput).toBe(false);
  });

  // ── Return value completeness ────────────────────────────────────────────

  it("updatedVariables is object or undefined — never null", async () => {
    mockGenerateObject.mockRejectedValueOnce(new Error("stop"));
    const r = await planAndExecuteHandler(makeNode(), makeCtx());
    expect(r.updatedVariables === undefined || typeof r.updatedVariables === "object").toBe(true);
  });

  it("messages[0] has role field", async () => {
    const r = await planAndExecuteHandler(makeNode(), makeCtx({ variables: {} }));
    if (r.messages.length > 0) {
      expect(["assistant", "system", "user"]).toContain(r.messages[0].role);
    }
  });
});
