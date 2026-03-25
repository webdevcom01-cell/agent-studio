import { describe, it, expect, vi, beforeEach } from "vitest";
import { switchHandler } from "../switch-handler";
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
    id: "switch-1",
    type: "switch",
    position: { x: 0, y: 0 },
    data: {
      label: "Switch",
      variable: "choice",
      operator: "equals",
      cases: [
        { value: "a", label: "Option A" },
        { value: "b", label: "Option B" },
        { value: "c", label: "Option C" },
      ],
      outputVariable: "switch_result",
      ...overrides,
    },
  };
}

function makeContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    agentId: "agent-1",
    conversationId: "conv-1",
    variables: { choice: "b" },
    messageHistory: [],
    flowContent: { nodes: [], edges: [], variables: [] },
    currentNodeId: null,
    isNewConversation: false,
    ...overrides,
  };
}

describe("switchHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("returns error when no variable specified", async () => {
    const node = makeNode({ variable: "" });
    const result = await switchHandler(node, makeContext());

    expect(result.messages[0].content).toContain("no variable specified");
  });

  it("returns error when no cases defined", async () => {
    const node = makeNode({ cases: [] });
    const result = await switchHandler(node, makeContext());

    expect(result.messages[0].content).toContain("no cases defined");
  });

  describe("equals operator", () => {
    it("matches the correct case (case-insensitive)", async () => {
      const ctx = makeContext({ variables: { choice: "B" } });
      const result = await switchHandler(makeNode(), ctx);

      expect(result.nextNodeId).toBe("case_1");
      const sr = result.updatedVariables?.switch_result as Record<string, unknown>;
      expect(sr.matched).toBe(true);
      expect(sr.matchedCase).toBe("b");
      expect(sr.matchedLabel).toBe("Option B");
      expect(sr.caseIndex).toBe(1);
    });

    it("routes to default when no case matches", async () => {
      const ctx = makeContext({ variables: { choice: "z" } });
      const result = await switchHandler(makeNode(), ctx);

      expect(result.nextNodeId).toBe("default");
      const sr = result.updatedVariables?.switch_result as Record<string, unknown>;
      expect(sr.matched).toBe(false);
      expect(sr.matchedCase).toBeNull();
    });

    it("matches first case", async () => {
      const ctx = makeContext({ variables: { choice: "a" } });
      const result = await switchHandler(makeNode(), ctx);

      expect(result.nextNodeId).toBe("case_0");
    });
  });

  describe("contains operator", () => {
    it("matches when value contains case text", async () => {
      const node = makeNode({
        operator: "contains",
        cases: [{ value: "error", label: "Error" }, { value: "warn", label: "Warning" }],
      });
      const ctx = makeContext({ variables: { choice: "This is a warning message" } });
      const result = await switchHandler(node, ctx);

      expect(result.nextNodeId).toBe("case_1");
    });
  });

  describe("starts_with operator", () => {
    it("matches prefix", async () => {
      const node = makeNode({
        operator: "starts_with",
        cases: [{ value: "hello", label: "Greeting" }],
      });
      const ctx = makeContext({ variables: { choice: "Hello World" } });
      const result = await switchHandler(node, ctx);

      expect(result.nextNodeId).toBe("case_0");
    });
  });

  describe("regex operator", () => {
    it("matches regex pattern", async () => {
      const node = makeNode({
        operator: "regex",
        cases: [{ value: "^\\d+$", label: "Number" }, { value: "^[a-z]+$", label: "Letters" }],
      });
      const ctx = makeContext({ variables: { choice: "42" } });
      const result = await switchHandler(node, ctx);

      expect(result.nextNodeId).toBe("case_0");
    });

    it("handles invalid regex gracefully", async () => {
      const node = makeNode({
        operator: "regex",
        cases: [{ value: "[invalid(", label: "Bad" }],
      });
      const ctx = makeContext({ variables: { choice: "test" } });
      const result = await switchHandler(node, ctx);

      // Invalid regex doesn't match, falls to default
      expect(result.nextNodeId).toBe("default");
    });
  });

  describe("numeric operators", () => {
    it("gt: routes when value is greater", async () => {
      const node = makeNode({
        operator: "gt",
        cases: [{ value: "100", label: "Over 100" }],
      });
      const ctx = makeContext({ variables: { choice: "150" } });
      const result = await switchHandler(node, ctx);

      expect(result.nextNodeId).toBe("case_0");
    });

    it("lt: routes when value is less", async () => {
      const node = makeNode({
        operator: "lt",
        cases: [{ value: "100", label: "Under 100" }],
      });
      const ctx = makeContext({ variables: { choice: "50" } });
      const result = await switchHandler(node, ctx);

      expect(result.nextNodeId).toBe("case_0");
    });

    it("lte: does not match when value is greater", async () => {
      const node = makeNode({
        operator: "lte",
        cases: [{ value: "100", label: "At most 100" }],
      });
      const ctx = makeContext({ variables: { choice: "150" } });
      const result = await switchHandler(node, ctx);

      expect(result.nextNodeId).toBe("default");
    });
  });

  it("resolves template variables in case values", async () => {
    const node = makeNode({
      cases: [{ value: "{{threshold}}", label: "Match" }],
    });
    const ctx = makeContext({ variables: { choice: "42", threshold: "42" } });
    const result = await switchHandler(node, ctx);

    expect(result.nextNodeId).toBe("case_0");
  });

  it("uses custom output variable", async () => {
    const node = makeNode({ outputVariable: "my_switch" });
    const result = await switchHandler(node, makeContext());

    expect(result.updatedVariables?.my_switch).toBeDefined();
  });

  it("handles empty variable value gracefully", async () => {
    const ctx = makeContext({ variables: { choice: "" } });
    const node = makeNode({
      cases: [{ value: "", label: "Empty" }],
    });
    const result = await switchHandler(node, ctx);

    expect(result.nextNodeId).toBe("case_0");
  });
});
