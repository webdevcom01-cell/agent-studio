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

// Mock handler registry to provide simple handlers for branch execution
vi.mock("../index", () => ({
  getHandler: (type: string) => {
    if (type === "message") {
      return async (node: FlowNode, _ctx: RuntimeContext) => ({
        messages: [{ role: "assistant" as const, content: (node.data.message as string) ?? "Hello" }],
        nextNodeId: null,
        waitForInput: false,
      });
    }
    if (type === "set_variable") {
      return async (node: FlowNode) => ({
        messages: [],
        nextNodeId: null,
        waitForInput: false,
        updatedVariables: {
          [(node.data.variableName as string)]: node.data.value,
        },
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
        { id: "parallel-1", type: "parallel", position: { x: 0, y: 0 }, data: {} },
        { id: "msg-a", type: "message", position: { x: 0, y: 100 }, data: { message: "Branch A done" } },
        { id: "msg-b", type: "message", position: { x: 200, y: 100 }, data: { message: "Branch B done" } },
        { id: "next-1", type: "message", position: { x: 0, y: 200 }, data: { message: "After parallel" } },
        { id: "fail-1", type: "message", position: { x: 200, y: 200 }, data: { message: "Failed" } },
      ],
      edges: [
        { id: "e-a", source: "parallel-1", target: "msg-a", sourceHandle: "branch-a" },
        { id: "e-b", source: "parallel-1", target: "msg-b", sourceHandle: "branch-b" },
        { id: "e-done", source: "parallel-1", target: "next-1", sourceHandle: "done" },
        { id: "e-fail", source: "parallel-1", target: "fail-1", sourceHandle: "failed" },
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
        { branchId: "branch-a", label: "Branch A", outputVariable: "result_a" },
        { branchId: "branch-b", label: "Branch B", outputVariable: "result_b" },
      ],
      mergeStrategy: "all",
      timeoutSeconds: 30,
      ...data,
    },
  };
}

describe("parallel-handler", () => {
  describe("basic execution", () => {
    it("should execute all branches and route to done", async () => {
      const ctx = makeContext();
      const node = makeParallelNode();

      const result = await parallelHandler(node, ctx);

      expect(result.nextNodeId).toBe("next-1");
      expect(result.waitForInput).toBe(false);
      // Should have messages from both branches
      expect(result.messages.length).toBeGreaterThanOrEqual(2);
    });

    it("should store per-branch results in output variables", async () => {
      const ctx = makeContext();
      const node = makeParallelNode();

      const result = await parallelHandler(node, ctx);

      expect(result.updatedVariables?.["result_a"]).toBeDefined();
      expect(result.updatedVariables?.["result_b"]).toBeDefined();

      const resultA = result.updatedVariables?.["result_a"] as Record<string, unknown>;
      expect(resultA.status).toBe("fulfilled");
    });

    it("should store overall parallel result", async () => {
      const ctx = makeContext();
      const node = makeParallelNode();

      const result = await parallelHandler(node, ctx);

      const overall = result.updatedVariables?.["__parallel_result"] as Record<string, unknown>;
      expect(overall.totalBranches).toBe(2);
      expect(overall.succeeded).toBe(2);
      expect(overall.failed).toBe(0);
    });
  });

  describe("empty/misconfigured branches", () => {
    it("should return error when branches is undefined", async () => {
      const ctx = makeContext();
      const node = makeParallelNode({ branches: undefined });

      const result = await parallelHandler(node, ctx);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content).toContain("requires branches configuration");
      expect(result.nextNodeId).toBeNull();
    });

    it("should return error when branches is empty array", async () => {
      const ctx = makeContext();
      const node = makeParallelNode({ branches: [] });

      const result = await parallelHandler(node, ctx);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content).toContain("requires branches configuration");
    });

    it("should return error when branch is missing branchId", async () => {
      const ctx = makeContext();
      const node = makeParallelNode({
        branches: [{ branchId: "", label: "Bad", outputVariable: "res" }],
      });

      const result = await parallelHandler(node, ctx);

      expect(result.messages[0].content).toContain("invalid branches");
    });

    it("should return error when branch is missing outputVariable", async () => {
      const ctx = makeContext();
      const node = makeParallelNode({
        branches: [{ branchId: "b-1", label: "Bad", outputVariable: "" }],
      });

      const result = await parallelHandler(node, ctx);

      expect(result.messages[0].content).toContain("invalid branches");
    });

    it("should warn when branches have no matching edges", async () => {
      const { logger } = await import("@/lib/logger");
      const ctx = makeContext({
        flowContent: {
          nodes: [
            { id: "parallel-1", type: "parallel", position: { x: 0, y: 0 }, data: {} },
          ],
          edges: [], // No edges at all
          variables: [],
        },
      });
      const node = makeParallelNode();

      const result = await parallelHandler(node, ctx);

      expect(logger.warn).toHaveBeenCalledWith(
        "Parallel branches have no matching edges",
        expect.objectContaining({
          unmatchedBranchIds: ["branch-a", "branch-b"],
        }),
      );
      expect(result.messages[0].content).toContain("No branches are connected");
    });
  });

  describe("merge strategies", () => {
    it("should route to done when all succeed with 'all' strategy", async () => {
      const ctx = makeContext();
      const node = makeParallelNode({ mergeStrategy: "all" });

      const result = await parallelHandler(node, ctx);

      expect(result.nextNodeId).toBe("next-1");
    });

    it("should route to done when any succeeds with 'any' strategy", async () => {
      const ctx = makeContext();
      const node = makeParallelNode({ mergeStrategy: "any" });

      const result = await parallelHandler(node, ctx);

      expect(result.nextNodeId).toBe("next-1");
    });
  });

  describe("single branch", () => {
    it("should work with just one branch", async () => {
      const ctx = makeContext();
      const node = makeParallelNode({
        branches: [
          { branchId: "branch-a", label: "Solo", outputVariable: "solo_result" },
        ],
      });

      const result = await parallelHandler(node, ctx);

      expect(result.nextNodeId).toBe("next-1");
      expect(result.updatedVariables?.["solo_result"]).toBeDefined();
    });
  });

  describe("safety limits", () => {
    it("should cap at MAX_BRANCHES (5)", async () => {
      const ctx = makeContext({
        flowContent: {
          nodes: [
            { id: "parallel-1", type: "parallel", position: { x: 0, y: 0 }, data: {} },
            ...Array.from({ length: 7 }, (_, i) => ({
              id: `msg-${i}`,
              type: "message" as const,
              position: { x: i * 100, y: 100 },
              data: { message: `Branch ${i}` },
            })),
            { id: "next-1", type: "message", position: { x: 0, y: 200 }, data: {} },
          ],
          edges: [
            ...Array.from({ length: 7 }, (_, i) => ({
              id: `e-${i}`,
              source: "parallel-1",
              target: `msg-${i}`,
              sourceHandle: `b-${i}`,
            })),
            { id: "e-done", source: "parallel-1", target: "next-1", sourceHandle: "done" },
          ],
          variables: [],
        },
      });

      const node = makeParallelNode({
        branches: Array.from({ length: 7 }, (_, i) => ({
          branchId: `b-${i}`,
          label: `Branch ${i}`,
          outputVariable: `result_${i}`,
        })),
      });

      const result = await parallelHandler(node, ctx);

      // Should still complete, but only first 5 branches are executed
      expect(result.nextNodeId).toBe("next-1");

      const overall = result.updatedVariables?.["__parallel_result"] as Record<string, unknown>;
      expect(overall.totalBranches).toBe(5);
    });
  });

  describe("branch with multiple nodes", () => {
    it("should execute chained nodes within a branch", async () => {
      const ctx = makeContext({
        flowContent: {
          nodes: [
            { id: "parallel-1", type: "parallel", position: { x: 0, y: 0 }, data: {} },
            { id: "set-1", type: "set_variable", position: { x: 0, y: 100 }, data: { variableName: "x", value: "42" } },
            { id: "msg-1", type: "message", position: { x: 0, y: 200 }, data: { message: "X is set" } },
            { id: "next-1", type: "message", position: { x: 0, y: 300 }, data: {} },
          ],
          edges: [
            { id: "e-a", source: "parallel-1", target: "set-1", sourceHandle: "branch-a" },
            { id: "e-chain", source: "set-1", target: "msg-1" },
            { id: "e-done", source: "parallel-1", target: "next-1", sourceHandle: "done" },
          ],
          variables: [],
        },
      });

      const node = makeParallelNode({
        branches: [
          { branchId: "branch-a", label: "Branch A", outputVariable: "result_a" },
        ],
      });

      const result = await parallelHandler(node, ctx);

      expect(result.nextNodeId).toBe("next-1");
      // Should have messages from message node in the branch chain
      const hasMsg = result.messages.some((m) => m.content === "X is set");
      expect(hasMsg).toBe(true);
    });
  });
});
