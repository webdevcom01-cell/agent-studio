import { describe, it, expect } from "vitest";
import { captureHandler } from "../capture-handler";
import type { FlowNode } from "@/types";
import type { RuntimeContext } from "../../types";

function makeNode(data: Record<string, unknown>): FlowNode {
  return { id: "n1", type: "capture", position: { x: 0, y: 0 }, data };
}

function makeContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: { nodes: [], edges: [], variables: [] },
    currentNodeId: "n1",
    variables: {},
    messageHistory: [],
    isNewConversation: false,
    isResuming: true,
    ...overrides,
  } as RuntimeContext;
}

describe("captureHandler email validation", () => {
  it("rejects email without domain part", async () => {
    const result = await captureHandler(
      makeNode({ variableName: "email", validationType: "email" }),
      makeContext({
        messageHistory: [{ role: "user", content: "user@" }],
      }),
    );
    expect(result.messages[0].content).toContain("valid email");
  });

  it("rejects email without TLD", async () => {
    const result = await captureHandler(
      makeNode({ variableName: "email", validationType: "email" }),
      makeContext({
        messageHistory: [{ role: "user", content: "user@domain" }],
      }),
    );
    expect(result.messages[0].content).toContain("valid email");
  });

  it("accepts valid email format", async () => {
    const result = await captureHandler(
      makeNode({ variableName: "email", validationType: "email" }),
      makeContext({
        messageHistory: [{ role: "user", content: "user@example.com" }],
      }),
    );
    expect(result.updatedVariables?.email).toBe("user@example.com");
  });

  it("rejects email with spaces", async () => {
    const result = await captureHandler(
      makeNode({ variableName: "email", validationType: "email" }),
      makeContext({
        messageHistory: [{ role: "user", content: "user @example.com" }],
      }),
    );
    expect(result.messages[0].content).toContain("valid email");
  });
});
