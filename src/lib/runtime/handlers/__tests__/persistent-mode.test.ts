/**
 * Tests for A3 Persistent Mode — reflexive_loop + end handler integration.
 *
 * Covers:
 * - Bounded mode (default) unchanged behavior
 * - Persistent mode: higher iteration cap, context variable management
 * - Verification command validation and blocking
 * - End handler persistent routing
 * - Variable cleanup on exit
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerateText = vi.fn();

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}));

vi.mock("@/lib/ai", () => ({
  getModel: vi.fn(() => "mock-model"),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock hooks — emitHook should be a no-op in tests
vi.mock("../../hooks", () => ({
  emitHook: vi.fn(),
}));

import { reflexiveLoopHandler } from "../reflexive-loop-handler";
import { endHandler } from "../end-handler";
import type { RuntimeContext } from "../../types";
import type { FlowNode, FlowContent } from "@/types";

function makeNode(overrides: Record<string, unknown> = {}): FlowNode {
  return {
    id: "refl-persistent-1",
    type: "reflexive_loop",
    position: { x: 0, y: 0 },
    data: {
      executorModel: "deepseek-chat",
      evaluatorModel: "deepseek-chat",
      maxIterations: 3,
      passingScore: 7,
      criteria: [{ name: "quality", description: "Overall quality", weight: 1 }],
      outputVariable: "reflexive_result",
      ...overrides,
    },
  };
}

function makeEndNode(overrides: Record<string, unknown> = {}): FlowNode {
  return {
    id: "end-1",
    type: "end",
    position: { x: 0, y: 0 },
    data: {
      message: "Flow complete.",
      ...overrides,
    },
  };
}

function makeContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    conversationId: "conv-persistent",
    agentId: "agent-persistent",
    flowContent: { nodes: [], edges: [], variables: [] } as FlowContent,
    currentNodeId: "refl-persistent-1",
    variables: { last_message: "Build a REST API" },
    messageHistory: [],
    isNewConversation: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Bounded mode (default — unchanged behavior) ───────────────────────────

describe("reflexiveLoopHandler — bounded mode", () => {
  it("defaults to bounded mode when mode not set", async () => {
    mockGenerateText.mockRejectedValueOnce(new Error("stop"));
    const ctx = makeContext();
    await reflexiveLoopHandler(makeNode(), ctx);

    // Should NOT set persistent variables
    expect(ctx.variables.__persistent_mode).toBeUndefined();
    expect(ctx.variables.__persistent_return_node).toBeUndefined();
  });

  it("caps maxIterations at 5 in bounded mode", async () => {
    mockGenerateText.mockRejectedValueOnce(new Error("stop"));
    const result = await reflexiveLoopHandler(
      makeNode({ maxIterations: 99, mode: "bounded" }),
      makeContext(),
    );

    expect(result).toHaveProperty("messages");
    expect(result.waitForInput).toBe(false);
  });

  it("does not include persistentCleanup variables in bounded mode", async () => {
    mockGenerateText.mockRejectedValueOnce(new Error("stop"));
    const result = await reflexiveLoopHandler(makeNode(), makeContext());

    // updatedVariables should not have __persistent_mode key
    const vars = result.updatedVariables ?? {};
    expect(vars).not.toHaveProperty("__persistent_mode");
    expect(vars).not.toHaveProperty("__persistent_return_node");
    expect(vars).not.toHaveProperty("__verifier_confirmed");
  });
});

// ─── Persistent mode ───────────────────────────────────────────────────────

describe("reflexiveLoopHandler — persistent mode", () => {
  it("sets __persistent_mode context variables", async () => {
    mockGenerateText.mockRejectedValueOnce(new Error("stop"));
    const ctx = makeContext();
    await reflexiveLoopHandler(makeNode({ mode: "persistent" }), ctx);

    // Context should have been set (even though handler errored)
    expect(ctx.variables.__persistent_mode).toBe(true);
    expect(ctx.variables.__persistent_return_node).toBe("refl-persistent-1");
    expect(ctx.variables.__verifier_confirmed).toBe(false);
  });

  it("allows maxIterations up to 20 in persistent mode", async () => {
    mockGenerateText.mockRejectedValueOnce(new Error("stop"));
    const result = await reflexiveLoopHandler(
      makeNode({ mode: "persistent", maxIterations: 15 }),
      makeContext(),
    );

    // Should not throw — 15 is within the persistent cap of 20
    expect(result).toHaveProperty("messages");
    expect(result.waitForInput).toBe(false);
  });

  it("caps maxIterations at 20 in persistent mode", async () => {
    mockGenerateText.mockRejectedValueOnce(new Error("stop"));
    const result = await reflexiveLoopHandler(
      makeNode({ mode: "persistent", maxIterations: 99 }),
      makeContext(),
    );

    expect(result).toHaveProperty("messages");
    expect(result.waitForInput).toBe(false);
  });

  it("cleans up persistent variables on success (passed)", async () => {
    // Simulate: generate returns text, evaluator returns high score
    mockGenerateText
      .mockResolvedValueOnce({ text: "Great API code" })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          scores: [{ name: "quality", score: 9, reasoning: "Excellent" }],
          overallScore: 9,
          feedback: "Great work",
        }),
      });

    const result = await reflexiveLoopHandler(
      makeNode({ mode: "persistent" }),
      makeContext(),
    );

    expect(result.nextNodeId).toBe("passed");
    const vars = result.updatedVariables ?? {};
    expect(vars.__persistent_mode).toBe(false);
    expect(vars.__verifier_confirmed).toBe(true);
    expect(vars.__persistent_return_node).toBeNull();
  });

  it("cleans up persistent variables on failure (cap reached)", async () => {
    // Simulate: generate returns text, evaluator returns low score — all iterations fail
    mockGenerateText
      .mockResolvedValueOnce({ text: "Attempt 1" })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          overallScore: 3,
          feedback: "Needs work",
          scores: [],
        }),
      })
      .mockResolvedValueOnce({ text: "Attempt 2" })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          overallScore: 4,
          feedback: "Still needs work",
          scores: [],
        }),
      })
      .mockResolvedValueOnce({ text: "Attempt 3" })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          overallScore: 5,
          feedback: "Getting better but not enough",
          scores: [],
        }),
      });

    const result = await reflexiveLoopHandler(
      makeNode({ mode: "persistent", maxIterations: 3 }),
      makeContext(),
    );

    expect(result.nextNodeId).toBe("failed");
    const vars = result.updatedVariables ?? {};
    expect(vars.__persistent_mode).toBe(false);
    expect(vars.__verifier_confirmed).toBe(false);
    expect(vars.__persistent_return_node).toBeNull();
  });

  it("cleans up persistent variables on error", async () => {
    mockGenerateText.mockRejectedValueOnce(new Error("AI down"));

    const result = await reflexiveLoopHandler(
      makeNode({ mode: "persistent" }),
      makeContext(),
    );

    expect(result.nextNodeId).toBe("failed");
    const vars = result.updatedVariables ?? {};
    expect(vars.__persistent_mode).toBe(false);
    expect(vars.__verifier_confirmed).toBe(false);
  });

  it("includes mode in output variable", async () => {
    mockGenerateText
      .mockResolvedValueOnce({ text: "Output" })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          overallScore: 9,
          feedback: "Good",
          scores: [],
        }),
      });

    const result = await reflexiveLoopHandler(
      makeNode({ mode: "persistent" }),
      makeContext(),
    );

    const outputVar = (result.updatedVariables ?? {})["reflexive_result"] as Record<string, unknown>;
    expect(outputVar.mode).toBe("persistent");
  });
});

// ─── Verification command validation ───────────────────────────────────────

describe("reflexiveLoopHandler — verification commands", () => {
  it("ignores verification commands in bounded mode", async () => {
    mockGenerateText
      .mockResolvedValueOnce({ text: "Output" })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          overallScore: 9,
          feedback: "Good",
          scores: [],
        }),
      });

    const result = await reflexiveLoopHandler(
      makeNode({
        mode: "bounded",
        verificationCommands: ["npm run test"],
      }),
      makeContext(),
    );

    // Should pass without running verification (bounded mode)
    expect(result.nextNodeId).toBe("passed");
  });

  it("filters out empty verification commands", async () => {
    mockGenerateText
      .mockResolvedValueOnce({ text: "Output" })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          overallScore: 9,
          feedback: "Good",
          scores: [],
        }),
      });

    // Empty strings and whitespace should be filtered
    const result = await reflexiveLoopHandler(
      makeNode({
        mode: "persistent",
        verificationCommands: ["", "  ", null, undefined],
      }),
      makeContext(),
    );

    // Should pass — no valid commands to run
    expect(result.nextNodeId).toBe("passed");
  });
});

// ─── End handler persistent routing ────────────────────────────────────────

describe("endHandler — persistent mode routing", () => {
  it("returns null nextNodeId in normal mode", async () => {
    const ctx = makeContext({ variables: {} });
    const result = await endHandler(makeEndNode(), ctx);

    expect(result.nextNodeId).toBeNull();
    expect(result.waitForInput).toBe(false);
  });

  it("routes back to reflexive_loop when persistent and not confirmed", async () => {
    const ctx = makeContext({
      variables: {
        __persistent_mode: true,
        __verifier_confirmed: false,
        __persistent_return_node: "refl-persistent-1",
      },
    });

    const result = await endHandler(makeEndNode(), ctx);

    expect(result.nextNodeId).toBe("refl-persistent-1");
    expect(result.waitForInput).toBe(false);
  });

  it("terminates when persistent but verifier confirmed", async () => {
    const ctx = makeContext({
      variables: {
        __persistent_mode: true,
        __verifier_confirmed: true,
        __persistent_return_node: "refl-persistent-1",
      },
    });

    const result = await endHandler(makeEndNode(), ctx);

    expect(result.nextNodeId).toBeNull();
  });

  it("terminates when __persistent_mode is false", async () => {
    const ctx = makeContext({
      variables: {
        __persistent_mode: false,
        __verifier_confirmed: false,
        __persistent_return_node: "refl-persistent-1",
      },
    });

    const result = await endHandler(makeEndNode(), ctx);

    expect(result.nextNodeId).toBeNull();
  });

  it("terminates when __persistent_return_node is missing", async () => {
    const ctx = makeContext({
      variables: {
        __persistent_mode: true,
        __verifier_confirmed: false,
      },
    });

    const result = await endHandler(makeEndNode(), ctx);

    expect(result.nextNodeId).toBeNull();
  });

  it("resolves message template in persistent routing", async () => {
    const ctx = makeContext({
      variables: {
        __persistent_mode: true,
        __verifier_confirmed: false,
        __persistent_return_node: "refl-persistent-1",
        status: "iterating",
      },
    });

    const result = await endHandler(
      makeEndNode({ message: "Status: {{status}}" }),
      ctx,
    );

    expect(result.messages[0].content).toBe("Status: iterating");
    expect(result.nextNodeId).toBe("refl-persistent-1");
  });
});
