import { describe, it, expect } from "vitest";
import { messageHandler } from "../message-handler";
import type { RuntimeContext } from "../../types";
import type { FlowNode } from "@/types";

function createNode(data: Record<string, unknown>): FlowNode {
  return {
    id: "msg-1",
    type: "message",
    position: { x: 0, y: 0 },
    data,
  };
}

function createContext(): RuntimeContext {
  return {
    agentId: "agent-1",
    conversationId: "conv-1",
    flowContent: { nodes: [], edges: [], variables: [] },
    variables: {},
    currentNodeId: "msg-1",
    messageHistory: [],
    isNewConversation: false,
  };
}

describe("messageHandler", () => {
  it("returns the message from node data", async () => {
    const node = createNode({ message: "Hello there!" });
    const result = await messageHandler(node, createContext());

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe("assistant");
    expect(result.messages[0].content).toBe("Hello there!");
    expect(result.waitForInput).toBe(false);
  });

  it("resolves template variables in message", async () => {
    const node = createNode({ message: "Hi {{name}}" });
    const ctx = createContext();
    ctx.variables = { name: "Alice" };

    const result = await messageHandler(node, ctx);
    expect(result.messages[0].content).toBe("Hi Alice");
  });

  it("returns empty messages array for empty message", async () => {
    const node = createNode({ message: "" });
    const result = await messageHandler(node, createContext());

    expect(result.messages).toHaveLength(0);
    expect(result.waitForInput).toBe(false);
  });

  it("returns empty messages array for missing message property", async () => {
    const node = createNode({});
    const result = await messageHandler(node, createContext());

    expect(result.messages).toHaveLength(0);
    expect(result.waitForInput).toBe(false);
  });
});
