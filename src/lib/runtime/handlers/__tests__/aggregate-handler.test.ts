import { describe, it, expect, vi, beforeEach } from "vitest";

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
  it("returns error when no branch inputs found", async () => {
    const result = await aggregateHandler(
      makeNode({ branchVariables: [] }),
      makeContext(),
    );
    expect(result.messages[0].content).toContain("no branch inputs");
  });

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
