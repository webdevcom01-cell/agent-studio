import { describe, it, expect, vi, beforeEach } from "vitest";

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({ logger: mockLogger }));

import { aggregateHandler } from "../aggregate-handler";
import type { RuntimeContext } from "../../types";
import type { FlowNode, FlowContent } from "@/types";

function makeNode(overrides: Record<string, unknown> = {}): FlowNode {
  return {
    id: "agg-1",
    type: "aggregate",
    position: { x: 0, y: 0 },
    data: {
      strategy: "wait_all",
      waitN: 1,
      timeout: 5,
      mergeMode: "concat",
      branchVariables: ["branch_a", "branch_b"],
      outputVariable: "aggregate_result",
      ...overrides,
    },
  };
}

function makeContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: { nodes: [], edges: [], variables: [] } as FlowContent,
    currentNodeId: "agg-1",
    variables: {
      branch_a: "Result from A",
      branch_b: "Result from B",
    },
    messageHistory: [],
    isNewConversation: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("aggregateHandler", () => {
  // ── Early validation ───────────────────────────────────────────────────

  it("returns error when branchVariables is undefined", async () => {
    const result = await aggregateHandler(
      makeNode({ branchVariables: undefined }),
      makeContext(),
    );
    expect(result.messages[0].content).toContain("requires branchVariables");
  });

  it("returns error when branchVariables is empty array", async () => {
    const result = await aggregateHandler(
      makeNode({ branchVariables: [] }),
      makeContext(),
    );
    expect(result.messages[0].content).toContain("requires branchVariables");
  });

  it("returns error when ALL configured variables are missing from context", async () => {
    const result = await aggregateHandler(
      makeNode({ branchVariables: ["missing_x", "missing_y"] }),
      makeContext({ variables: {} }),
    );
    expect(result.messages[0].content).toContain("none of the configured");
    expect(result.messages[0].content).toContain("missing_x");
  });

  it("warns when some variables are missing but continues with available ones", async () => {
    const result = await aggregateHandler(
      makeNode({ branchVariables: ["branch_a", "nonexistent"] }),
      makeContext(),
    );

    expect(mockLogger.warn).toHaveBeenCalledWith(
      "Aggregate: some branch variables not found in context",
      expect.objectContaining({
        missing: ["nonexistent"],
        available: ["branch_a"],
      }),
    );
    expect(result.updatedVariables?.aggregate_result_count).toBe(1);
  });

  // ── Merge strategies ───────────────────────────────────────────────────

  it("wait_all collects all branches", async () => {
    const result = await aggregateHandler(makeNode(), makeContext());
    expect(result.updatedVariables?.aggregate_result).toContain("Result from A");
    expect(result.updatedVariables?.aggregate_result).toContain("Result from B");
    expect(result.updatedVariables?.aggregate_result_count).toBe(2);
    expect(result.updatedVariables?.aggregate_result_failed).toBe(0);
  });

  it("wait_first returns first result", async () => {
    const result = await aggregateHandler(
      makeNode({ strategy: "wait_first" }),
      makeContext(),
    );
    expect(result.updatedVariables?.aggregate_result_count).toBe(1);
  });

  it("wait_n returns N results", async () => {
    const result = await aggregateHandler(
      makeNode({ strategy: "wait_n", waitN: 1 }),
      makeContext(),
    );
    expect(result.updatedVariables?.aggregate_result_count).toBeGreaterThanOrEqual(1);
  });

  // ── Merge modes ────────────────────────────────────────────────────────

  it("merge mode 'first' returns first branch value", async () => {
    const result = await aggregateHandler(
      makeNode({ mergeMode: "first" }),
      makeContext(),
    );
    expect(result.updatedVariables?.aggregate_result).toBe("Result from A");
  });

  it("merge mode 'last' returns last branch value", async () => {
    const result = await aggregateHandler(
      makeNode({ mergeMode: "last" }),
      makeContext(),
    );
    expect(result.updatedVariables?.aggregate_result).toBe("Result from B");
  });

  it("merge mode 'object' merges as keyed object", async () => {
    const result = await aggregateHandler(
      makeNode({ mergeMode: "object" }),
      makeContext(),
    );
    const merged = result.updatedVariables?.aggregate_result as Record<string, unknown>;
    expect(merged.branch_a).toBe("Result from A");
    expect(merged.branch_b).toBe("Result from B");
  });

  it("merges string values with concat (newline separated)", async () => {
    const result = await aggregateHandler(
      makeNode({ mergeMode: "concat" }),
      makeContext(),
    );
    const output = result.updatedVariables?.aggregate_result as string;
    expect(output).toBe("Result from A\nResult from B");
  });

  it("merges object values by JSON.stringify in concat mode", async () => {
    const result = await aggregateHandler(
      makeNode({ mergeMode: "concat" }),
      makeContext({
        variables: {
          branch_a: { score: 85, verdict: "PASS" },
          branch_b: { score: 42, verdict: "FAIL" },
        },
      }),
    );
    const output = result.updatedVariables?.aggregate_result as string;
    expect(output).toContain('"score":85');
    expect(output).toContain('"score":42');
  });

  // ── Error handling ─────────────────────────────────────────────────────

  it("handles partial failure (one branch has error)", async () => {
    const result = await aggregateHandler(
      makeNode(),
      makeContext({
        variables: {
          branch_a: "Success",
          branch_b: "[Error: timeout]",
        },
      }),
    );
    expect(result.updatedVariables?.aggregate_result_failed).toBe(1);
    expect(result.updatedVariables?.aggregate_result_count).toBe(1);
  });

  it("sets strategy in output metadata", async () => {
    const result = await aggregateHandler(
      makeNode({ strategy: "wait_first" }),
      makeContext(),
    );
    expect(result.updatedVariables?.aggregate_result_strategy).toBe("wait_first");
  });
});
