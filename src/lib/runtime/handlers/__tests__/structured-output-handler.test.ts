import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({
  getModel: vi.fn(() => "mock-model"),
}));

import { structuredOutputHandler } from "../structured-output-handler";
import { generateObject } from "ai";
import type { RuntimeContext } from "../../types";
import type { FlowNode, FlowContent } from "@/types";

const mockGenerateObject = vi.mocked(generateObject);

function makeNode(overrides: Record<string, unknown> = {}): FlowNode {
  return {
    id: "structured-1",
    type: "structured_output",
    position: { x: 0, y: 0 },
    data: {
      prompt: "Extract name and age",
      jsonSchema: '{"type":"object","properties":{"name":{"type":"string"},"age":{"type":"number"}},"required":["name","age"]}',
      outputVariable: "result",
      model: "deepseek-chat",
      ...overrides,
    },
  };
}

function makeContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: { nodes: [], edges: [], variables: [] } as FlowContent,
    currentNodeId: "structured-1",
    variables: {},
    messageHistory: [],
    isNewConversation: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("structuredOutputHandler", () => {
  it("returns error message when prompt is empty", async () => {
    const result = await structuredOutputHandler(
      makeNode({ prompt: "" }),
      makeContext(),
    );
    expect(result.messages[0].content).toContain("no prompt");
  });

  it("returns error when JSON schema is invalid", async () => {
    const result = await structuredOutputHandler(
      makeNode({ jsonSchema: "not-json" }),
      makeContext(),
    );
    expect(result.updatedVariables?.result).toContain("[Error:");
  });

  it("calls generateObject and stores result in output variable", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: { name: "Alice", age: 30 },
      finishReason: "stop",
      usage: { promptTokens: 10, completionTokens: 20 },
      toJsonResponse: () => new Response(),
    } as ReturnType<typeof generateObject> extends Promise<infer T> ? T : never);

    const result = await structuredOutputHandler(
      makeNode(),
      makeContext(),
    );

    expect(result.updatedVariables?.result).toEqual({ name: "Alice", age: 30 });
    expect(mockGenerateObject).toHaveBeenCalledOnce();
  });

  it("resolves template variables in prompt", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: { name: "Bob" },
      finishReason: "stop",
      usage: { promptTokens: 10, completionTokens: 20 },
      toJsonResponse: () => new Response(),
    } as ReturnType<typeof generateObject> extends Promise<infer T> ? T : never);

    await structuredOutputHandler(
      makeNode({ prompt: "Extract from: {{text}}" }),
      makeContext({ variables: { text: "Bob is 25" } }),
    );

    expect(mockGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "Extract from: Bob is 25" }),
    );
  });

  it("handles generateObject failure gracefully", async () => {
    mockGenerateObject.mockRejectedValueOnce(new Error("API rate limit"));

    const result = await structuredOutputHandler(
      makeNode(),
      makeContext(),
    );

    expect(result.updatedVariables?.result).toContain("[Error: API rate limit]");
  });
});
