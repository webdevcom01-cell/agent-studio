import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { waitHandler } from "../wait-handler";
import type { FlowNode } from "@/types";
import type { RuntimeContext } from "../../types";

function makeNode(duration?: number): FlowNode {
  return { id: "wait-1", type: "wait", position: { x: 0, y: 0 }, data: { label: "Wait", duration } };
}

const CTX: RuntimeContext = {
  conversationId: "conv-1",
  agentId: "agent-1",
  flowContent: { nodes: [], edges: [], variables: [] },
  currentNodeId: "wait-1",
  variables: {},
  messageHistory: [],
  isNewConversation: false,
};

describe("waitHandler", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("returns empty result with no messages", async () => {
    const promise = waitHandler(makeNode(0), CTX);
    await vi.advanceTimersByTimeAsync(100);
    const result = await promise;
    expect(result.messages).toHaveLength(0);
    expect(result.nextNodeId).toBeNull();
    expect(result.waitForInput).toBe(false);
  });

  it("defaults to 1 second when duration is not provided", async () => {
    const promise = waitHandler(makeNode(), CTX);
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;
    expect(result.messages).toHaveLength(0);
  });

  it("caps duration at 5 seconds", async () => {
    const promise = waitHandler(makeNode(60), CTX);
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;
    expect(result.messages).toHaveLength(0);
  });
});
