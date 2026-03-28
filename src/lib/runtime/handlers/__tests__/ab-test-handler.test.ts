import { describe, it, expect, vi, beforeEach } from "vitest";

import { abTestHandler } from "../ab-test-handler";
import type { RuntimeContext } from "../../types";
import type { FlowNode, FlowContent } from "@/types";

function makeNode(overrides: Record<string, unknown> = {}): FlowNode {
  return {
    id: "ab-1",
    type: "ab_test",
    position: { x: 0, y: 0 },
    data: {
      variants: [
        { id: "A", weight: 50 },
        { id: "B", weight: 50 },
      ],
      outputVariable: "variant",
      stickyKey: "",
      ...overrides,
    },
  };
}

function makeContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: {
      nodes: [],
      edges: [
        { id: "e1", source: "ab-1", target: "node-a", sourceHandle: "A" },
        { id: "e2", source: "ab-1", target: "node-b", sourceHandle: "B" },
      ],
      variables: [],
    } as FlowContent,
    currentNodeId: "ab-1",
    variables: {},
    messageHistory: [],
    isNewConversation: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Math, "random").mockReturnValue(0.3);
});

describe("abTestHandler", () => {
  it("returns error when no variants configured", async () => {
    const result = await abTestHandler(
      makeNode({ variants: [] }),
      makeContext(),
    );
    expect(result.messages[0].content).toContain("no variants");
  });

  it("selects variant A when random < 50%", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.3);

    const result = await abTestHandler(makeNode(), makeContext());
    expect(result.updatedVariables?.variant).toBe("A");
    expect(result.nextNodeId).toBe("node-a");
  });

  it("selects variant B when random > 50%", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.7);

    const result = await abTestHandler(makeNode(), makeContext());
    expect(result.updatedVariables?.variant).toBe("B");
    expect(result.nextNodeId).toBe("node-b");
  });

  it("respects weighted distribution", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.85);

    const result = await abTestHandler(
      makeNode({
        variants: [
          { id: "A", weight: 80 },
          { id: "B", weight: 20 },
        ],
      }),
      makeContext(),
    );
    expect(result.updatedVariables?.variant).toBe("B");
  });

  it("uses sticky assignment from existing variable", async () => {
    const result = await abTestHandler(
      makeNode({ stickyKey: "user_variant" }),
      makeContext({ variables: { user_variant: "B" } }),
    );
    expect(result.updatedVariables?.variant).toBe("B");
    expect(result.updatedVariables?.variant_source).toBe("sticky");
    expect(result.nextNodeId).toBe("node-b");
  });

  it("stores sticky key when provided", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.3);

    const result = await abTestHandler(
      makeNode({ stickyKey: "user_variant" }),
      makeContext(),
    );
    expect(result.updatedVariables?.user_variant).toBe("A");
    expect(result.updatedVariables?.variant_source).toBe("random");
  });

  it("returns null nextNodeId when no matching edge", async () => {
    const result = await abTestHandler(
      makeNode(),
      makeContext({
        flowContent: { nodes: [], edges: [], variables: [] },
      }),
    );
    expect(result.nextNodeId).toBeNull();
  });

  it("handles invalid variant data gracefully", async () => {
    const result = await abTestHandler(
      makeNode({ variants: "not-an-array" }),
      makeContext(),
    );
    expect(result.messages[0].content).toContain("no variants");
  });
});
