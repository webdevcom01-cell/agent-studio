import { describe, it, expect } from "vitest";
import { validateFlowContent } from "../flow-content";

describe("validateFlowContent", () => {
  it("accepts valid flow content", () => {
    const result = validateFlowContent({
      nodes: [
        { id: "n1", type: "message", position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [{ id: "e1", source: "n1", target: "n2" }],
      variables: [{ name: "x", type: "string", default: "" }],
    });

    expect(result.success).toBe(true);
  });

  it("accepts empty flow", () => {
    const result = validateFlowContent({
      nodes: [],
      edges: [],
      variables: [],
    });

    expect(result.success).toBe(true);
  });

  it("defaults variables to empty array when missing", () => {
    const result = validateFlowContent({
      nodes: [],
      edges: [],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.variables).toEqual([]);
    }
  });

  it("rejects invalid node type", () => {
    const result = validateFlowContent({
      nodes: [
        { id: "n1", type: "invalid_type", position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Invalid flow content");
    }
  });

  it("rejects node without id", () => {
    const result = validateFlowContent({
      nodes: [
        { id: "", type: "message", position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [],
    });

    expect(result.success).toBe(false);
  });

  it("rejects non-finite position values", () => {
    const result = validateFlowContent({
      nodes: [
        { id: "n1", type: "message", position: { x: Infinity, y: 0 }, data: {} },
      ],
      edges: [],
    });

    expect(result.success).toBe(false);
  });

  it("rejects edge without source", () => {
    const result = validateFlowContent({
      nodes: [],
      edges: [{ id: "e1", source: "", target: "n2" }],
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid variable type", () => {
    const result = validateFlowContent({
      nodes: [],
      edges: [],
      variables: [{ name: "x", type: "invalid", default: "" }],
    });

    expect(result.success).toBe(false);
  });

  it("rejects null input", () => {
    const result = validateFlowContent(null);

    expect(result.success).toBe(false);
  });

  it("rejects string input", () => {
    const result = validateFlowContent("not an object");

    expect(result.success).toBe(false);
  });

  it("accepts all valid node types", () => {
    const nodeTypes = [
      "message", "button", "capture", "condition", "set_variable",
      "end", "goto", "wait", "ai_response", "ai_classify",
      "ai_extract", "ai_summarize", "api_call", "function",
      "kb_search", "webhook", "mcp_tool", "call_agent", "human_approval",
    ];

    for (const type of nodeTypes) {
      const result = validateFlowContent({
        nodes: [{ id: "n1", type, position: { x: 0, y: 0 }, data: {} }],
        edges: [],
      });
      expect(result.success).toBe(true);
    }
  });
});
