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

  // ── Output format and secondary variable (P-10) ─────────────────────────

  describe("output format (P-10)", () => {
    const mockResult = {
      object: { name: "Alice", score: 95 },
      finishReason: "stop",
      usage: { promptTokens: 10, completionTokens: 20 },
      toJsonResponse: () => new Response(),
    };

    it("stores as object by default (backward compat)", async () => {
      mockGenerateObject.mockResolvedValueOnce(mockResult as ReturnType<typeof generateObject> extends Promise<infer T> ? T : never);

      const result = await structuredOutputHandler(makeNode(), makeContext());
      expect(result.updatedVariables?.result).toEqual({ name: "Alice", score: 95 });
      expect(typeof result.updatedVariables?.result).toBe("object");
    });

    it("stores as JSON string when outputFormat is 'string'", async () => {
      mockGenerateObject.mockResolvedValueOnce(mockResult as ReturnType<typeof generateObject> extends Promise<infer T> ? T : never);

      const result = await structuredOutputHandler(
        makeNode({ outputFormat: "string" }),
        makeContext(),
      );
      const val = result.updatedVariables?.result;
      expect(typeof val).toBe("string");
      expect(JSON.parse(val as string)).toEqual({ name: "Alice", score: 95 });
    });

    it("populates secondaryOutputVariable with alternate format", async () => {
      mockGenerateObject.mockResolvedValueOnce(mockResult as ReturnType<typeof generateObject> extends Promise<infer T> ? T : never);

      const result = await structuredOutputHandler(
        makeNode({ outputFormat: "object", secondaryOutputVariable: "result_str" }),
        makeContext(),
      );

      // Primary: object
      expect(typeof result.updatedVariables?.result).toBe("object");
      // Secondary: string
      const secondary = result.updatedVariables?.result_str;
      expect(typeof secondary).toBe("string");
      expect(JSON.parse(secondary as string)).toEqual({ name: "Alice", score: 95 });
    });

    it("secondary is object when primary is string", async () => {
      mockGenerateObject.mockResolvedValueOnce(mockResult as ReturnType<typeof generateObject> extends Promise<infer T> ? T : never);

      const result = await structuredOutputHandler(
        makeNode({ outputFormat: "string", secondaryOutputVariable: "result_obj" }),
        makeContext(),
      );

      expect(typeof result.updatedVariables?.result).toBe("string");
      expect(result.updatedVariables?.result_obj).toEqual({ name: "Alice", score: 95 });
    });

    it("template {{var.field}} works with object output", async () => {
      const { resolveTemplate } = await import("../../template");
      const resolved = resolveTemplate("Name: {{result.name}}", {
        result: { name: "Alice", score: 95 },
      });
      expect(resolved).toBe("Name: Alice");
    });

    it("template {{var.field}} works with JSON string output (P-02)", async () => {
      const { resolveTemplate } = await import("../../template");
      const resolved = resolveTemplate("Name: {{result.name}}", {
        result: '{"name":"Alice","score":95}',
      });
      expect(resolved).toBe("Name: Alice");
    });
  });
});
