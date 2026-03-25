import { describe, it, expect } from "vitest";
import { buttonHandler } from "../button-handler";
import type { FlowNode, FlowEdge } from "@/types";
import type { RuntimeContext } from "../../types";

const BUTTONS = [
  { id: "opt-a", label: "Option A", value: "a" },
  { id: "opt-b", label: "Option B", value: "b" },
];

function makeNode(overrides: Record<string, unknown> = {}): FlowNode {
  return {
    id: "btn-1",
    type: "button",
    position: { x: 0, y: 0 },
    data: { label: "Buttons", buttons: BUTTONS, message: "Pick one:", variableName: "choice", ...overrides },
  };
}

function makeContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: { nodes: [], edges: [], variables: [] },
    currentNodeId: "btn-1",
    variables: {},
    messageHistory: [],
    isNewConversation: false,
    isResuming: false,
    ...overrides,
  };
}

describe("buttonHandler", () => {
  describe("prompt display (not resuming)", () => {
    it("shows message with button labels when not resuming", async () => {
      const result = await buttonHandler(makeNode(), makeContext());
      expect(result.waitForInput).toBe(true);
      expect(result.messages[0].content).toContain("Pick one:");
      expect(result.messages[0].content).toContain("Option A");
      expect(result.messages[0].content).toContain("Option B");
    });

    it("shows default Choose: prefix when no message", async () => {
      const result = await buttonHandler(makeNode({ message: "" }), makeContext());
      expect(result.messages[0].content).toContain("Choose:");
    });

    it("includes button metadata", async () => {
      const result = await buttonHandler(makeNode(), makeContext());
      const meta = result.messages[0].metadata;
      expect(meta?.buttons).toEqual([
        { label: "Option A", value: "a" },
        { label: "Option B", value: "b" },
      ]);
    });
  });

  describe("button selection (resuming)", () => {
    it("matches user input by value", async () => {
      const edges: FlowEdge[] = [{ id: "e1", source: "btn-1", target: "next-a", sourceHandle: "opt-a" }];
      const result = await buttonHandler(
        makeNode(),
        makeContext({
          isResuming: true,
          messageHistory: [{ role: "user", content: "a" }],
          flowContent: { nodes: [], edges, variables: [] },
        }),
      );
      expect(result.nextNodeId).toBe("next-a");
      expect(result.updatedVariables?.choice).toBe("a");
    });

    it("matches user input by label", async () => {
      const edges: FlowEdge[] = [{ id: "e1", source: "btn-1", target: "next-b", sourceHandle: "opt-b" }];
      const result = await buttonHandler(
        makeNode(),
        makeContext({
          isResuming: true,
          messageHistory: [{ role: "user", content: "Option B" }],
          flowContent: { nodes: [], edges, variables: [] },
        }),
      );
      expect(result.nextNodeId).toBe("next-b");
      expect(result.updatedVariables?.choice).toBe("b");
    });

    it("falls through to else handle when no button matches", async () => {
      const edges: FlowEdge[] = [{ id: "e-else", source: "btn-1", target: "else-node", sourceHandle: "else" }];
      const result = await buttonHandler(
        makeNode(),
        makeContext({
          isResuming: true,
          messageHistory: [{ role: "user", content: "something else" }],
          flowContent: { nodes: [], edges, variables: [] },
        }),
      );
      expect(result.nextNodeId).toBe("else-node");
      expect(result.updatedVariables).toBeUndefined();
    });

    it("falls through to default edge when no sourceHandle match", async () => {
      const edges: FlowEdge[] = [{ id: "e-default", source: "btn-1", target: "default-node" }];
      const result = await buttonHandler(
        makeNode(),
        makeContext({
          isResuming: true,
          messageHistory: [{ role: "user", content: "random" }],
          flowContent: { nodes: [], edges, variables: [] },
        }),
      );
      expect(result.nextNodeId).toBe("default-node");
    });

    it("uses default variableName when not provided", async () => {
      const result = await buttonHandler(
        makeNode({ variableName: "" }),
        makeContext({
          isResuming: true,
          messageHistory: [{ role: "user", content: "a" }],
        }),
      );
      expect(result.updatedVariables?.["btn-1_selection"]).toBe("a");
    });
  });

  describe("visit count safety", () => {
    it("breaks out after too many visits", async () => {
      const result = await buttonHandler(
        makeNode(),
        makeContext({ variables: { "__visit_count_btn-1": 4 } }),
      );
      expect(result.messages[0].content).toContain("stuck");
      expect(result.waitForInput).toBe(false);
      expect(result.nextNodeId).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("handles empty buttons array", async () => {
      const result = await buttonHandler(makeNode({ buttons: [] }), makeContext());
      expect(result.waitForInput).toBe(true);
    });

    it("resolves template variables in message", async () => {
      const result = await buttonHandler(
        makeNode({ message: "Hello {{name}}" }),
        makeContext({ variables: { name: "Alice" } }),
      );
      expect(result.messages[0].content).toContain("Hello Alice");
    });
  });
});
