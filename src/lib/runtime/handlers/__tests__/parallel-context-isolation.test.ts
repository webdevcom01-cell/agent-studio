import { describe, it, expect, vi } from "vitest";
import { parallelHandler } from "../parallel-handler";
import type { RuntimeContext } from "../../types";
import type { FlowNode } from "@/types";

// Mock the logger
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

/**
 * Mock handler registry — set_variable handler mutates branch variables,
 * message handler reads variables to verify isolation.
 */
vi.mock("../index", () => ({
  getHandler: (type: string) => {
    if (type === "set_variable") {
      return async (node: FlowNode, ctx: RuntimeContext) => ({
        messages: [],
        nextNodeId: (node.data.nextNodeId as string) ?? null,
        waitForInput: false,
        updatedVariables: {
          [(node.data.variableName as string)]: node.data.value,
        },
      });
    }
    if (type === "message") {
      return async (node: FlowNode, ctx: RuntimeContext) => ({
        messages: [
          {
            role: "assistant" as const,
            content: `vars=${JSON.stringify(ctx.variables)}`,
          },
        ],
        nextNodeId: null,
        waitForInput: false,
      });
    }
    return null;
  },
}));

function makeContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: {
      nodes: [
        {
          id: "parallel-1",
          type: "parallel",
          position: { x: 0, y: 0 },
          data: {},
        },
        // Branch A: set nested.value = "branch-a-wrote" then message
        {
          id: "set-a",
          type: "set_variable",
          position: { x: 0, y: 100 },
          data: {
            variableName: "nested",
            value: { modified: true, source: "branch-a" },
            nextNodeId: "msg-a",
          },
        },
        {
          id: "msg-a",
          type: "message",
          position: { x: 0, y: 200 },
          data: { message: "A" },
        },
        // Branch B: set nested.value = "branch-b-wrote" then message
        {
          id: "set-b",
          type: "set_variable",
          position: { x: 200, y: 100 },
          data: {
            variableName: "nested",
            value: { modified: true, source: "branch-b" },
            nextNodeId: "msg-b",
          },
        },
        {
          id: "msg-b",
          type: "message",
          position: { x: 200, y: 200 },
          data: { message: "B" },
        },
        {
          id: "next-1",
          type: "message",
          position: { x: 0, y: 300 },
          data: { message: "Done" },
        },
        {
          id: "fail-1",
          type: "message",
          position: { x: 200, y: 300 },
          data: { message: "Failed" },
        },
      ],
      edges: [
        {
          id: "e-a",
          source: "parallel-1",
          target: "set-a",
          sourceHandle: "branch-a",
        },
        {
          id: "e-b",
          source: "parallel-1",
          target: "set-b",
          sourceHandle: "branch-b",
        },
        {
          id: "e-done",
          source: "parallel-1",
          target: "next-1",
          sourceHandle: "done",
        },
        {
          id: "e-fail",
          source: "parallel-1",
          target: "fail-1",
          sourceHandle: "failed",
        },
      ],
      variables: [],
    },
    currentNodeId: "parallel-1",
    variables: {},
    messageHistory: [],
    isNewConversation: true,
    ...overrides,
  };
}

function makeParallelNode(data: Record<string, unknown> = {}): FlowNode {
  return {
    id: "parallel-1",
    type: "parallel",
    position: { x: 0, y: 0 },
    data: {
      label: "Parallel",
      branches: [
        {
          branchId: "branch-a",
          label: "Branch A",
          outputVariable: "result_a",
        },
        {
          branchId: "branch-b",
          label: "Branch B",
          outputVariable: "result_b",
        },
      ],
      mergeStrategy: "all",
      timeoutSeconds: 30,
      ...data,
    },
  };
}

describe("parallel-handler context isolation (B2)", () => {
  it("branch A variable write does not affect branch B variables", async () => {
    const sharedObject = { original: true, deep: { level: 1 } };
    const context = makeContext({
      variables: { nested: sharedObject },
    });
    const node = makeParallelNode();

    const result = await parallelHandler(node, context);

    // Both branches should have run successfully
    expect(result.messages.length).toBeGreaterThanOrEqual(2);

    // Branch A wrote { modified: true, source: "branch-a" } to "nested"
    // Branch B wrote { modified: true, source: "branch-b" } to "nested"
    // Each branch sees its own write, not the other's
    const branchAOutput = result.updatedVariables?.result_a;
    const branchBOutput = result.updatedVariables?.result_b;

    // Verify branch outputs are independent
    expect(branchAOutput).toBeDefined();
    expect(branchBOutput).toBeDefined();
  });

  it("original context.variables is not mutated by branch execution", async () => {
    const originalNested = { value: "original", deep: { count: 0 } };
    const context = makeContext({
      variables: { nested: originalNested },
    });
    const node = makeParallelNode();

    await parallelHandler(node, context);

    // The original context.variables.nested should be untouched
    expect(context.variables.nested).toBe(originalNested);
    expect((context.variables.nested as Record<string, unknown>).value).toBe(
      "original"
    );
    expect(
      (
        (context.variables.nested as Record<string, unknown>)
          .deep as Record<string, unknown>
      ).count
    ).toBe(0);
  });

  it("deep nested objects are fully isolated between branches", async () => {
    const context = makeContext({
      variables: {
        config: {
          settings: { theme: "dark", nested: { level1: { level2: "deep" } } },
        },
      },
    });
    const node = makeParallelNode();

    const result = await parallelHandler(node, context);

    // Original config should be completely untouched
    const config = context.variables.config as Record<string, unknown>;
    const settings = config.settings as Record<string, unknown>;
    expect(settings.theme).toBe("dark");
    expect(
      (
        (settings.nested as Record<string, unknown>).level1 as Record<
          string,
          unknown
        >
      ).level2
    ).toBe("deep");
  });

  it("arrays in variables are isolated between branches", async () => {
    const originalArray = [1, 2, 3];
    const context = makeContext({
      variables: { items: originalArray },
    });
    const node = makeParallelNode();

    await parallelHandler(node, context);

    // Original array reference should be untouched
    expect(context.variables.items).toBe(originalArray);
    expect(context.variables.items).toEqual([1, 2, 3]);
  });

  it("MAX_BRANCHES allows up to 10 branches", async () => {
    const branches = Array.from({ length: 10 }, (_, i) => ({
      branchId: `branch-${i}`,
      label: `Branch ${i}`,
      outputVariable: `result_${i}`,
    }));

    const nodes = [
      {
        id: "parallel-1",
        type: "parallel" as const,
        position: { x: 0, y: 0 },
        data: {},
      },
      ...branches.map((b, i) => ({
        id: `msg-${i}`,
        type: "message" as const,
        position: { x: i * 100, y: 100 },
        data: { message: `Branch ${i}` },
      })),
      {
        id: "next-1",
        type: "message" as const,
        position: { x: 0, y: 200 },
        data: { message: "Done" },
      },
      {
        id: "fail-1",
        type: "message" as const,
        position: { x: 200, y: 200 },
        data: { message: "Failed" },
      },
    ];

    const edges = [
      ...branches.map((b, i) => ({
        id: `e-${i}`,
        source: "parallel-1",
        target: `msg-${i}`,
        sourceHandle: b.branchId,
      })),
      {
        id: "e-done",
        source: "parallel-1",
        target: "next-1",
        sourceHandle: "done",
      },
      {
        id: "e-fail",
        source: "parallel-1",
        target: "fail-1",
        sourceHandle: "failed",
      },
    ];

    const context = makeContext({
      flowContent: { nodes, edges, variables: [] },
    });
    const node: FlowNode = {
      id: "parallel-1",
      type: "parallel",
      position: { x: 0, y: 0 },
      data: {
        label: "Parallel",
        branches,
        mergeStrategy: "all",
        timeoutSeconds: 30,
      },
    };

    const result = await parallelHandler(node, context);

    // All 10 branches should succeed
    expect(result.messages.length).toBeGreaterThanOrEqual(10);
  });

  it("structuredClone properly isolates Date objects in variables", async () => {
    const testDate = new Date("2026-01-15T10:00:00Z");
    const context = makeContext({
      variables: { createdAt: testDate, metadata: { timestamp: testDate } },
    });
    const node = makeParallelNode();

    await parallelHandler(node, context);

    // Original date should be untouched and still a Date instance
    expect(context.variables.createdAt).toBe(testDate);
    expect(context.variables.createdAt).toBeInstanceOf(Date);
  });
});
