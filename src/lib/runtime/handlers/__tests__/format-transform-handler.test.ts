import { describe, it, expect, vi, beforeEach } from "vitest";
import { formatTransformHandler } from "../format-transform-handler";
import type { RuntimeContext } from "../../types";
import type { FlowNode } from "@/types";

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function makeNode(overrides: Partial<FlowNode["data"]> = {}): FlowNode {
  return {
    id: "fmt-1",
    type: "format_transform",
    position: { x: 0, y: 0 },
    data: {
      label: "Format Transform",
      format: "template",
      inputVariable: "",
      inputValue: "hello world",
      template: "",
      separator: ",",
      outputVariable: "transform_result",
      ...overrides,
    },
  };
}

function makeContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    agentId: "agent-1",
    conversationId: "conv-1",
    variables: {},
    messageHistory: [],
    flowContent: { nodes: [], edges: [], variables: [] },
    currentNodeId: null,
    isNewConversation: false,
    ...overrides,
  };
}

describe("formatTransformHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("returns error when no input data", async () => {
    const node = makeNode({ inputValue: "", inputVariable: "" });
    const result = await formatTransformHandler(node, makeContext());

    expect(result.messages[0].content).toContain("no input data");
  });

  describe("uppercase / lowercase / trim", () => {
    it("converts to uppercase", async () => {
      const node = makeNode({ format: "uppercase", inputValue: "hello" });
      const result = await formatTransformHandler(node, makeContext());

      expect(result.updatedVariables?.transform_result).toBe("HELLO");
    });

    it("converts to lowercase", async () => {
      const node = makeNode({ format: "lowercase", inputValue: "HELLO" });
      const result = await formatTransformHandler(node, makeContext());

      expect(result.updatedVariables?.transform_result).toBe("hello");
    });

    it("trims whitespace", async () => {
      const node = makeNode({ format: "trim", inputValue: "  hello  " });
      const result = await formatTransformHandler(node, makeContext());

      expect(result.updatedVariables?.transform_result).toBe("hello");
    });
  });

  describe("split / join", () => {
    it("splits string by separator", async () => {
      const node = makeNode({ format: "split", inputValue: "a,b,c", separator: "," });
      const result = await formatTransformHandler(node, makeContext());

      expect(result.updatedVariables?.transform_result).toEqual(["a", "b", "c"]);
    });

    it("joins array by separator", async () => {
      const node = makeNode({ format: "join", inputValue: '["x","y","z"]', separator: " - " });
      const result = await formatTransformHandler(node, makeContext());

      expect(result.updatedVariables?.transform_result).toBe("x - y - z");
    });

    it("join fails on non-array", async () => {
      const node = makeNode({ format: "join", inputValue: '"not-array"' });
      const result = await formatTransformHandler(node, makeContext());

      expect(result.messages[0].content).toContain("requires an array");
    });
  });

  describe("json_to_text", () => {
    it("pretty-prints JSON", async () => {
      const node = makeNode({ format: "json_to_text", inputValue: '{"a":1}' });
      const result = await formatTransformHandler(node, makeContext());

      expect(result.updatedVariables?.transform_result).toContain('"a": 1');
    });
  });

  describe("text_to_json", () => {
    it("parses valid JSON string", async () => {
      const node = makeNode({ format: "text_to_json", inputValue: '{"name":"Alice"}' });
      const result = await formatTransformHandler(node, makeContext());

      expect(result.updatedVariables?.transform_result).toEqual({ name: "Alice" });
    });

    it("parses key:value lines", async () => {
      const node = makeNode({ format: "text_to_json", inputValue: "name: Alice\nage: 30" });
      const result = await formatTransformHandler(node, makeContext());

      expect(result.updatedVariables?.transform_result).toEqual({ name: "Alice", age: "30" });
    });

    it("wraps plain text as { value: ... }", async () => {
      const node = makeNode({ format: "text_to_json", inputValue: "just text" });
      const result = await formatTransformHandler(node, makeContext());

      expect(result.updatedVariables?.transform_result).toEqual({ value: "just text" });
    });
  });

  describe("csv_to_json", () => {
    it("converts CSV to array of objects", async () => {
      const node = makeNode({ format: "csv_to_json", inputValue: "name,age\nAlice,30\nBob,25" });
      const result = await formatTransformHandler(node, makeContext());

      expect(result.updatedVariables?.transform_result).toEqual([
        { name: "Alice", age: "30" },
        { name: "Bob", age: "25" },
      ]);
    });
  });

  describe("json_to_csv", () => {
    it("converts array of objects to CSV", async () => {
      const input = JSON.stringify([{ name: "Alice", age: 30 }, { name: "Bob", age: 25 }]);
      const node = makeNode({ format: "json_to_csv", inputValue: input });
      const result = await formatTransformHandler(node, makeContext());

      const csv = result.updatedVariables?.transform_result as string;
      expect(csv).toContain("name,age");
      expect(csv).toContain("Alice,30");
    });
  });

  describe("template format", () => {
    it("uses template with input variables", async () => {
      const node = makeNode({
        format: "template",
        inputValue: '{"name":"Alice","score":"99"}',
        template: "Hello {{name}}, score: {{score}}",
      });
      const result = await formatTransformHandler(node, makeContext());

      expect(result.updatedVariables?.transform_result).toBe("Hello Alice, score: 99");
    });

    it("fails when no template provided", async () => {
      const node = makeNode({ format: "template", template: "" });
      const result = await formatTransformHandler(node, makeContext());

      expect(result.messages[0].content).toContain("requires a template string");
    });
  });

  describe("variable input", () => {
    it("reads input from context variable", async () => {
      const node = makeNode({ format: "uppercase", inputVariable: "data", inputValue: "" });
      const ctx = makeContext({ variables: { data: "from-var" } });
      const result = await formatTransformHandler(node, ctx);

      expect(result.updatedVariables?.transform_result).toBe("FROM-VAR");
    });
  });

  it("returns error for unknown format", async () => {
    const node = makeNode({ format: "xml_to_json" });
    const result = await formatTransformHandler(node, makeContext());

    expect(result.messages[0].content).toContain("unknown transform format");
  });

  it("uses custom output variable", async () => {
    const node = makeNode({ format: "uppercase", outputVariable: "my_out" });
    const result = await formatTransformHandler(node, makeContext());

    expect(result.updatedVariables?.my_out).toBeDefined();
  });
});
