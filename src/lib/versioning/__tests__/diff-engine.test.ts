import { describe, it, expect } from "vitest";
import { computeFlowDiff, generateChangesSummary } from "../diff-engine";
import type { FlowContent } from "@/types";

function makeContent(
  overrides: Partial<FlowContent> = {}
): FlowContent {
  return {
    nodes: [],
    edges: [],
    variables: [],
    ...overrides,
  };
}

describe("computeFlowDiff", () => {
  it("detects no changes between identical flows", () => {
    const content = makeContent({
      nodes: [
        { id: "n1", type: "message", position: { x: 0, y: 0 }, data: { text: "hi" } },
      ],
      edges: [{ id: "e1", source: "n1", target: "n2" }],
    });

    const diff = computeFlowDiff(content, content);

    expect(diff.nodes.added).toHaveLength(0);
    expect(diff.nodes.removed).toHaveLength(0);
    expect(diff.nodes.modified).toHaveLength(0);
    expect(diff.nodes.unchanged).toBe(1);
    expect(diff.edges.unchanged).toBe(1);
    expect(diff.summary).toBe("No changes");
  });

  it("detects added nodes", () => {
    const before = makeContent();
    const after = makeContent({
      nodes: [
        { id: "n1", type: "ai_response", position: { x: 0, y: 0 }, data: {} },
      ],
    });

    const diff = computeFlowDiff(before, after);

    expect(diff.nodes.added).toHaveLength(1);
    expect(diff.nodes.added[0].id).toBe("n1");
    expect(diff.summary).toContain("Added 1 node");
  });

  it("detects removed nodes", () => {
    const before = makeContent({
      nodes: [
        { id: "n1", type: "message", position: { x: 0, y: 0 }, data: {} },
        { id: "n2", type: "end", position: { x: 0, y: 100 }, data: {} },
      ],
    });
    const after = makeContent({
      nodes: [
        { id: "n1", type: "message", position: { x: 0, y: 0 }, data: {} },
      ],
    });

    const diff = computeFlowDiff(before, after);

    expect(diff.nodes.removed).toHaveLength(1);
    expect(diff.nodes.removed[0].id).toBe("n2");
  });

  it("detects modified node data", () => {
    const before = makeContent({
      nodes: [
        { id: "n1", type: "message", position: { x: 0, y: 0 }, data: { text: "hello" } },
      ],
    });
    const after = makeContent({
      nodes: [
        { id: "n1", type: "message", position: { x: 0, y: 0 }, data: { text: "goodbye" } },
      ],
    });

    const diff = computeFlowDiff(before, after);

    expect(diff.nodes.modified).toHaveLength(1);
    expect(diff.nodes.modified[0].changes).toContain("data: text");
  });

  it("ignores position changes under 10px threshold", () => {
    const before = makeContent({
      nodes: [
        { id: "n1", type: "message", position: { x: 100, y: 100 }, data: {} },
      ],
    });
    const after = makeContent({
      nodes: [
        { id: "n1", type: "message", position: { x: 105, y: 103 }, data: {} },
      ],
    });

    const diff = computeFlowDiff(before, after);

    expect(diff.nodes.modified).toHaveLength(0);
    expect(diff.nodes.unchanged).toBe(1);
  });

  it("detects position changes over threshold", () => {
    const before = makeContent({
      nodes: [
        { id: "n1", type: "message", position: { x: 100, y: 100 }, data: {} },
      ],
    });
    const after = makeContent({
      nodes: [
        { id: "n1", type: "message", position: { x: 200, y: 100 }, data: {} },
      ],
    });

    const diff = computeFlowDiff(before, after);

    expect(diff.nodes.modified).toHaveLength(1);
    expect(diff.nodes.modified[0].changes).toContain("position moved");
  });

  it("detects edge changes", () => {
    const before = makeContent({
      edges: [{ id: "e1", source: "n1", target: "n2" }],
    });
    const after = makeContent({
      edges: [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
      ],
    });

    const diff = computeFlowDiff(before, after);

    expect(diff.edges.added).toHaveLength(1);
    expect(diff.edges.unchanged).toBe(1);
  });

  it("detects variable changes", () => {
    const before = makeContent({
      variables: [
        { name: "x", type: "string", default: "" },
        { name: "y", type: "number", default: 0 },
      ],
    });
    const after = makeContent({
      variables: [
        { name: "x", type: "number", default: 0 },
        { name: "z", type: "boolean", default: false },
      ],
    });

    const diff = computeFlowDiff(before, after);

    expect(diff.variables.added).toContain("z");
    expect(diff.variables.removed).toContain("y");
    expect(diff.variables.modified).toContain("x");
  });
});

describe("generateChangesSummary", () => {
  it("returns structured summary object", () => {
    const before = makeContent();
    const after = makeContent({
      nodes: [
        { id: "n1", type: "message", position: { x: 0, y: 0 }, data: {} },
      ],
    });

    const summary = generateChangesSummary(before, after) as Record<string, unknown>;

    expect(summary.nodesAdded).toEqual([{ id: "n1", type: "message" }]);
    expect(summary.summary).toContain("Added 1 node");
  });
});
