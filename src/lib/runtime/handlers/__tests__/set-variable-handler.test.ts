import { describe, it, expect } from "vitest";
import { setVariableHandler } from "../set-variable-handler";
import type { FlowNode } from "@/types";
import type { RuntimeContext } from "../../types";

function makeNode(variableName: string, value: string): FlowNode {
  return { id: "sv-1", type: "set_variable", position: { x: 0, y: 0 }, data: { label: "Set Var", variableName, value } };
}

function makeContext(variables: Record<string, unknown> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: { nodes: [], edges: [], variables: [] },
    currentNodeId: "sv-1",
    variables,
    messageHistory: [],
    isNewConversation: false,
  };
}

describe("setVariableHandler", () => {
  it("sets a variable to a static value", async () => {
    const result = await setVariableHandler(makeNode("greeting", "hello"), makeContext());
    expect(result.updatedVariables).toEqual({ greeting: "hello" });
    expect(result.messages).toHaveLength(0);
    expect(result.waitForInput).toBe(false);
  });

  it("resolves template variables in value", async () => {
    const result = await setVariableHandler(
      makeNode("fullName", "{{first}} {{last}}"),
      makeContext({ first: "John", last: "Doe" }),
    );
    expect(result.updatedVariables).toEqual({ fullName: "John Doe" });
  });

  it("returns undefined updatedVariables when variableName is empty", async () => {
    const result = await setVariableHandler(makeNode("", "test"), makeContext());
    expect(result.updatedVariables).toBeUndefined();
  });

  it("handles empty value", async () => {
    const result = await setVariableHandler(makeNode("x", ""), makeContext());
    expect(result.updatedVariables).toEqual({ x: "" });
  });

  it("handles missing data fields gracefully", async () => {
    const node: FlowNode = { id: "sv-1", type: "set_variable", position: { x: 0, y: 0 }, data: { label: "Set" } };
    const result = await setVariableHandler(node, makeContext());
    expect(result.updatedVariables).toBeUndefined();
  });
});
