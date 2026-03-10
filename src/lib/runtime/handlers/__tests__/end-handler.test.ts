import { describe, it, expect } from "vitest";
import { endHandler } from "../end-handler";
import type { FlowNode } from "@/types";
import type { RuntimeContext } from "../../types";

function makeNode(message?: string): FlowNode {
  return { id: "end-1", type: "end", position: { x: 0, y: 0 }, data: { label: "End", message } };
}

function makeContext(variables: Record<string, unknown> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: { nodes: [], edges: [], variables: [] },
    currentNodeId: "end-1",
    variables,
    messageHistory: [],
    isNewConversation: false,
  };
}

describe("endHandler", () => {
  it("returns message when provided", async () => {
    const result = await endHandler(makeNode("Goodbye!"), makeContext());
    expect(result.messages).toEqual([{ role: "assistant", content: "Goodbye!" }]);
    expect(result.nextNodeId).toBeNull();
    expect(result.waitForInput).toBe(false);
  });

  it("returns no messages when message is empty", async () => {
    const result = await endHandler(makeNode(""), makeContext());
    expect(result.messages).toHaveLength(0);
  });

  it("returns no messages when message is undefined", async () => {
    const result = await endHandler(makeNode(), makeContext());
    expect(result.messages).toHaveLength(0);
  });

  it("resolves template variables in message", async () => {
    const result = await endHandler(makeNode("Bye {{name}}!"), makeContext({ name: "Alice" }));
    expect(result.messages[0].content).toBe("Bye Alice!");
  });
});
