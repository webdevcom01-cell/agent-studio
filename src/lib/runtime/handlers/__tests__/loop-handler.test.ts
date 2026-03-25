import { describe, it, expect, beforeEach } from "vitest";
import { loopHandler } from "../loop-handler";
import type { RuntimeContext } from "../../types";
import type { FlowNode } from "@/types";

function makeContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: {
      nodes: [],
      edges: [
        { id: "e1", source: "loop-1", target: "body-1", sourceHandle: "loop_body" },
        { id: "e2", source: "loop-1", target: "next-1", sourceHandle: "done" },
      ],
      variables: [],
    },
    currentNodeId: "loop-1",
    variables: {},
    messageHistory: [],
    isNewConversation: true,
    ...overrides,
  };
}

function makeLoopNode(data: Record<string, unknown> = {}): FlowNode {
  return {
    id: "loop-1",
    type: "loop",
    position: { x: 0, y: 0 },
    data: {
      label: "Loop",
      mode: "count",
      maxIterations: 3,
      loopVariable: "loop_index",
      ...data,
    },
  };
}

describe("loop-handler", () => {
  describe("count mode", () => {
    it("should route to loop_body on first call", async () => {
      const ctx = makeContext();
      const node = makeLoopNode();

      const result = await loopHandler(node, ctx);

      expect(result.nextNodeId).toBe("body-1");
      expect(result.waitForInput).toBe(false);
      expect(result.updatedVariables?.["loop_index"]).toBe(0);
    });

    it("should track iteration state across calls", async () => {
      const ctx = makeContext({
        variables: {
          __loop_state: [{ nodeId: "loop-1", iteration: 1, maxIterations: 3 }],
        },
      });
      const node = makeLoopNode();

      const result = await loopHandler(node, ctx);

      expect(result.nextNodeId).toBe("body-1");
      expect(result.updatedVariables?.["loop_index"]).toBe(1);
    });

    it("should exit via done handle when max iterations reached", async () => {
      const ctx = makeContext({
        variables: {
          __loop_state: [{ nodeId: "loop-1", iteration: 3, maxIterations: 3 }],
        },
      });
      const node = makeLoopNode();

      const result = await loopHandler(node, ctx);

      expect(result.nextNodeId).toBe("next-1");
      expect(result.waitForInput).toBe(false);
      // Loop state should be cleaned up
      const states = result.updatedVariables?.["__loop_state"] as unknown[];
      expect(states).toHaveLength(0);
    });

    it("should clamp maxIterations to 100", async () => {
      const ctx = makeContext();
      const node = makeLoopNode({ maxIterations: 999 });

      const result = await loopHandler(node, ctx);

      // Should still work, just clamped
      expect(result.nextNodeId).toBe("body-1");
    });

    it("should default maxIterations to 10 when not specified", async () => {
      const ctx = makeContext();
      const node = makeLoopNode({ maxIterations: undefined });

      const result = await loopHandler(node, ctx);

      expect(result.nextNodeId).toBe("body-1");
    });
  });

  describe("condition mode (until)", () => {
    it("should continue looping when condition is not met", async () => {
      const ctx = makeContext({
        variables: {
          __loop_state: [{ nodeId: "loop-1", iteration: 1, maxIterations: 10 }],
          status: "pending",
        },
      });
      const node = makeLoopNode({
        mode: "condition",
        conditionVariable: "status",
        conditionOperator: "equals",
        conditionValue: "done",
      });

      const result = await loopHandler(node, ctx);

      expect(result.nextNodeId).toBe("body-1");
    });

    it("should exit when condition is met", async () => {
      const ctx = makeContext({
        variables: {
          __loop_state: [{ nodeId: "loop-1", iteration: 2, maxIterations: 10 }],
          status: "done",
        },
      });
      const node = makeLoopNode({
        mode: "condition",
        conditionVariable: "status",
        conditionOperator: "equals",
        conditionValue: "done",
      });

      const result = await loopHandler(node, ctx);

      expect(result.nextNodeId).toBe("next-1");
    });

    it("should not check condition on first iteration", async () => {
      const ctx = makeContext({
        variables: {
          status: "done",
        },
      });
      const node = makeLoopNode({
        mode: "condition",
        conditionVariable: "status",
        conditionOperator: "equals",
        conditionValue: "done",
      });

      const result = await loopHandler(node, ctx);

      // First iteration should always enter the loop body
      expect(result.nextNodeId).toBe("body-1");
    });
  });

  describe("while mode", () => {
    it("should continue while condition is true", async () => {
      const ctx = makeContext({
        variables: {
          __loop_state: [{ nodeId: "loop-1", iteration: 1, maxIterations: 10 }],
          active: "true",
        },
      });
      const node = makeLoopNode({
        mode: "while",
        conditionVariable: "active",
        conditionOperator: "is_truthy",
      });

      const result = await loopHandler(node, ctx);

      expect(result.nextNodeId).toBe("body-1");
    });

    it("should exit when condition becomes false", async () => {
      const ctx = makeContext({
        variables: {
          __loop_state: [{ nodeId: "loop-1", iteration: 3, maxIterations: 10 }],
          active: "",
        },
      });
      const node = makeLoopNode({
        mode: "while",
        conditionVariable: "active",
        conditionOperator: "is_truthy",
      });

      const result = await loopHandler(node, ctx);

      expect(result.nextNodeId).toBe("next-1");
    });
  });

  describe("condition operators", () => {
    it("should handle not_equals", async () => {
      const ctx = makeContext({
        variables: {
          __loop_state: [{ nodeId: "loop-1", iteration: 1, maxIterations: 10 }],
          val: "hello",
        },
      });
      const node = makeLoopNode({
        mode: "condition",
        conditionVariable: "val",
        conditionOperator: "not_equals",
        conditionValue: "hello",
      });

      // not_equals "hello" when val is "hello" -> condition is FALSE -> continue looping
      const result = await loopHandler(node, ctx);
      expect(result.nextNodeId).toBe("body-1");
    });

    it("should handle contains", async () => {
      const ctx = makeContext({
        variables: {
          __loop_state: [{ nodeId: "loop-1", iteration: 1, maxIterations: 10 }],
          text: "hello world",
        },
      });
      const node = makeLoopNode({
        mode: "condition",
        conditionVariable: "text",
        conditionOperator: "contains",
        conditionValue: "world",
      });

      // contains "world" is TRUE -> exit (condition mode = until condition met)
      const result = await loopHandler(node, ctx);
      expect(result.nextNodeId).toBe("next-1");
    });

    it("should handle greater_than", async () => {
      const ctx = makeContext({
        variables: {
          __loop_state: [{ nodeId: "loop-1", iteration: 1, maxIterations: 10 }],
          score: 85,
        },
      });
      const node = makeLoopNode({
        mode: "condition",
        conditionVariable: "score",
        conditionOperator: "greater_than",
        conditionValue: "80",
      });

      const result = await loopHandler(node, ctx);
      expect(result.nextNodeId).toBe("next-1");
    });

    it("should handle is_falsy", async () => {
      const ctx = makeContext({
        variables: {
          __loop_state: [{ nodeId: "loop-1", iteration: 1, maxIterations: 10 }],
          done: "false",
        },
      });
      const node = makeLoopNode({
        mode: "condition",
        conditionVariable: "done",
        conditionOperator: "is_falsy",
      });

      const result = await loopHandler(node, ctx);
      expect(result.nextNodeId).toBe("next-1");
    });
  });

  describe("edge cases", () => {
    it("should handle missing loop_body edge gracefully", async () => {
      const ctx = makeContext({
        flowContent: {
          nodes: [],
          edges: [
            { id: "e2", source: "loop-1", target: "next-1", sourceHandle: "done" },
          ],
          variables: [],
        },
      });
      const node = makeLoopNode();

      const result = await loopHandler(node, ctx);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content).toContain("no body");
    });

    it("should use default edge if done handle not found", async () => {
      const ctx = makeContext({
        variables: {
          __loop_state: [{ nodeId: "loop-1", iteration: 3, maxIterations: 3 }],
        },
        flowContent: {
          nodes: [],
          edges: [
            { id: "e1", source: "loop-1", target: "body-1", sourceHandle: "loop_body" },
            { id: "e3", source: "loop-1", target: "fallback-1" },
          ],
          variables: [],
        },
      });
      const node = makeLoopNode();

      const result = await loopHandler(node, ctx);

      expect(result.nextNodeId).toBe("fallback-1");
    });

    it("should use custom loop variable name", async () => {
      const ctx = makeContext();
      const node = makeLoopNode({ loopVariable: "i" });

      const result = await loopHandler(node, ctx);

      expect(result.updatedVariables?.["i"]).toBe(0);
    });

    it("should preserve other loop states for nested loops", async () => {
      const ctx = makeContext({
        variables: {
          __loop_state: [
            { nodeId: "outer-loop", iteration: 2, maxIterations: 5 },
          ],
        },
      });
      const node = makeLoopNode();

      const result = await loopHandler(node, ctx);

      const states = result.updatedVariables?.["__loop_state"] as Array<{
        nodeId: string;
      }>;
      expect(states).toHaveLength(2);
      expect(states.find((s) => s.nodeId === "outer-loop")).toBeDefined();
      expect(states.find((s) => s.nodeId === "loop-1")).toBeDefined();
    });
  });
});
