import { describe, it, expect } from "vitest";
import { conditionHandler } from "../condition-handler";
import type { FlowNode, FlowEdge } from "@/types";
import type { RuntimeContext } from "../../types";

function makeNode(branches: Array<{ id: string; variable: string; operator: string; value: string }>): FlowNode {
  return { id: "cond-1", type: "condition", position: { x: 0, y: 0 }, data: { label: "Condition", branches } };
}

function makeContext(variables: Record<string, unknown> = {}, edges: FlowEdge[] = []): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: { nodes: [], edges, variables: [] },
    currentNodeId: "cond-1",
    variables,
    messageHistory: [],
    isNewConversation: false,
  };
}

describe("conditionHandler", () => {
  describe("equals operator", () => {
    it("matches when variable equals value", async () => {
      const edges: FlowEdge[] = [{ id: "e1", source: "cond-1", target: "next-1", sourceHandle: "b1" }];
      const result = await conditionHandler(
        makeNode([{ id: "b1", variable: "status", operator: "equals", value: "active" }]),
        makeContext({ status: "active" }, edges),
      );
      expect(result.nextNodeId).toBe("next-1");
    });

    it("does not match when variable differs", async () => {
      const result = await conditionHandler(
        makeNode([{ id: "b1", variable: "status", operator: "equals", value: "active" }]),
        makeContext({ status: "inactive" }),
      );
      expect(result.nextNodeId).toBeNull();
    });

    it("coerces non-string values to string for comparison", async () => {
      const edges: FlowEdge[] = [{ id: "e1", source: "cond-1", target: "next-1", sourceHandle: "b1" }];
      const result = await conditionHandler(
        makeNode([{ id: "b1", variable: "count", operator: "equals", value: "42" }]),
        makeContext({ count: 42 }, edges),
      );
      expect(result.nextNodeId).toBe("next-1");
    });
  });

  describe("not_equals operator", () => {
    it("matches when variable differs from value", async () => {
      const edges: FlowEdge[] = [{ id: "e1", source: "cond-1", target: "next-1", sourceHandle: "b1" }];
      const result = await conditionHandler(
        makeNode([{ id: "b1", variable: "status", operator: "not_equals", value: "active" }]),
        makeContext({ status: "inactive" }, edges),
      );
      expect(result.nextNodeId).toBe("next-1");
    });
  });

  describe("contains operator", () => {
    it("matches when variable contains substring", async () => {
      const edges: FlowEdge[] = [{ id: "e1", source: "cond-1", target: "next-1", sourceHandle: "b1" }];
      const result = await conditionHandler(
        makeNode([{ id: "b1", variable: "message", operator: "contains", value: "hello" }]),
        makeContext({ message: "say hello world" }, edges),
      );
      expect(result.nextNodeId).toBe("next-1");
    });

    it("handles null variable gracefully", async () => {
      const result = await conditionHandler(
        makeNode([{ id: "b1", variable: "missing", operator: "contains", value: "test" }]),
        makeContext({}),
      );
      expect(result.nextNodeId).toBeNull();
    });
  });

  describe("greater_than / less_than operators", () => {
    it("matches greater_than when numeric value is larger", async () => {
      const edges: FlowEdge[] = [{ id: "e1", source: "cond-1", target: "next-1", sourceHandle: "b1" }];
      const result = await conditionHandler(
        makeNode([{ id: "b1", variable: "score", operator: "greater_than", value: "50" }]),
        makeContext({ score: 75 }, edges),
      );
      expect(result.nextNodeId).toBe("next-1");
    });

    it("does not match greater_than when equal", async () => {
      const result = await conditionHandler(
        makeNode([{ id: "b1", variable: "score", operator: "greater_than", value: "50" }]),
        makeContext({ score: 50 }),
      );
      expect(result.nextNodeId).toBeNull();
    });

    it("matches less_than when numeric value is smaller", async () => {
      const edges: FlowEdge[] = [{ id: "e1", source: "cond-1", target: "next-1", sourceHandle: "b1" }];
      const result = await conditionHandler(
        makeNode([{ id: "b1", variable: "score", operator: "less_than", value: "50" }]),
        makeContext({ score: 25 }, edges),
      );
      expect(result.nextNodeId).toBe("next-1");
    });
  });

  describe("is_set / is_empty operators", () => {
    it("is_set matches when variable has a value", async () => {
      const edges: FlowEdge[] = [{ id: "e1", source: "cond-1", target: "next-1", sourceHandle: "b1" }];
      const result = await conditionHandler(
        makeNode([{ id: "b1", variable: "name", operator: "is_set", value: "" }]),
        makeContext({ name: "Alice" }, edges),
      );
      expect(result.nextNodeId).toBe("next-1");
    });

    it("is_set does not match when variable is empty string", async () => {
      const result = await conditionHandler(
        makeNode([{ id: "b1", variable: "name", operator: "is_set", value: "" }]),
        makeContext({ name: "" }),
      );
      expect(result.nextNodeId).toBeNull();
    });

    it("is_set does not match when variable is null", async () => {
      const result = await conditionHandler(
        makeNode([{ id: "b1", variable: "name", operator: "is_set", value: "" }]),
        makeContext({ name: null }),
      );
      expect(result.nextNodeId).toBeNull();
    });

    it("is_empty matches when variable is undefined", async () => {
      const edges: FlowEdge[] = [{ id: "e1", source: "cond-1", target: "next-1", sourceHandle: "b1" }];
      const result = await conditionHandler(
        makeNode([{ id: "b1", variable: "missing", operator: "is_empty", value: "" }]),
        makeContext({}, edges),
      );
      expect(result.nextNodeId).toBe("next-1");
    });
  });

  describe("else branch and fallback", () => {
    it("falls through to else edge when no branch matches", async () => {
      const edges: FlowEdge[] = [{ id: "e-else", source: "cond-1", target: "else-node", sourceHandle: "else" }];
      const result = await conditionHandler(
        makeNode([{ id: "b1", variable: "x", operator: "equals", value: "yes" }]),
        makeContext({ x: "no" }, edges),
      );
      expect(result.nextNodeId).toBe("else-node");
    });

    it("returns fallback message when no branch and no else edge", async () => {
      const result = await conditionHandler(
        makeNode([{ id: "b1", variable: "x", operator: "equals", value: "yes" }]),
        makeContext({ x: "no" }),
      );
      expect(result.messages[0].content).toContain("not sure");
      expect(result.nextNodeId).toBeNull();
    });
  });

  describe("multiple branches", () => {
    it("evaluates branches in order, returns first match", async () => {
      const edges: FlowEdge[] = [
        { id: "e1", source: "cond-1", target: "first", sourceHandle: "b1" },
        { id: "e2", source: "cond-1", target: "second", sourceHandle: "b2" },
      ];
      const result = await conditionHandler(
        makeNode([
          { id: "b1", variable: "x", operator: "equals", value: "hello" },
          { id: "b2", variable: "x", operator: "contains", value: "hel" },
        ]),
        makeContext({ x: "hello" }, edges),
      );
      expect(result.nextNodeId).toBe("first");
    });
  });

  describe("unknown operator", () => {
    it("returns false for unknown operator", async () => {
      const result = await conditionHandler(
        makeNode([{ id: "b1", variable: "x", operator: "unknown_op", value: "test" }]),
        makeContext({ x: "test" }),
      );
      expect(result.nextNodeId).toBeNull();
    });
  });

  it("handles empty branches array", async () => {
    const result = await conditionHandler(
      makeNode([]),
      makeContext(),
    );
    expect(result.messages).toHaveLength(1);
  });
});
