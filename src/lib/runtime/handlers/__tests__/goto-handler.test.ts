import { describe, it, expect } from "vitest";
import { gotoHandler } from "../goto-handler";
import type { FlowNode } from "@/types";
import type { RuntimeContext } from "../../types";

function makeNode(targetNodeId?: string): FlowNode {
  return { id: "goto-1", type: "goto", position: { x: 0, y: 0 }, data: { label: "Goto", targetNodeId } };
}

function makeContext(nodeIds: string[] = []): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: { nodes: nodeIds.map((id) => ({ id, type: "message" as const, position: { x: 0, y: 0 }, data: {} })), edges: [], variables: [] },
    currentNodeId: "goto-1",
    variables: {},
    messageHistory: [],
    isNewConversation: false,
  };
}

describe("gotoHandler", () => {
  it("navigates to target node when it exists", async () => {
    const result = await gotoHandler(makeNode("target-1"), makeContext(["target-1"]));
    expect(result.nextNodeId).toBe("target-1");
    expect(result.messages).toHaveLength(0);
    expect(result.waitForInput).toBe(false);
  });

  it("returns null nextNodeId when target does not exist", async () => {
    const result = await gotoHandler(makeNode("nonexistent"), makeContext(["other"]));
    expect(result.nextNodeId).toBeNull();
  });

  it("returns null nextNodeId when targetNodeId is empty", async () => {
    const result = await gotoHandler(makeNode(""), makeContext());
    expect(result.nextNodeId).toBeNull();
  });

  it("returns null nextNodeId when targetNodeId is undefined", async () => {
    const result = await gotoHandler(makeNode(), makeContext());
    expect(result.nextNodeId).toBeNull();
  });
});
