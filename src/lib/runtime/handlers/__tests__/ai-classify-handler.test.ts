import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FlowNode, FlowEdge } from "@/types";
import type { RuntimeContext } from "../../types";

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const mockGenerateText = vi.fn();
vi.mock("ai", () => ({ generateText: (...args: unknown[]) => mockGenerateText(...args) }));

const mockGetModel = vi.fn().mockReturnValue("mock-model");
vi.mock("@/lib/ai", () => ({
  getModel: (...args: unknown[]) => mockGetModel(...args),
  DEFAULT_MODEL: "deepseek-chat",
}));

import { aiClassifyHandler } from "../ai-classify-handler";

function makeNode(overrides: Record<string, unknown> = {}): FlowNode {
  return {
    id: "cls-1",
    type: "ai_classify",
    position: { x: 0, y: 0 },
    data: { label: "Classify", categories: ["positive", "negative", "neutral"], inputVariable: "message", ...overrides },
  };
}

function makeContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: { nodes: [], edges: [], variables: [] },
    currentNodeId: "cls-1",
    variables: {},
    messageHistory: [],
    isNewConversation: false,
    ...overrides,
  };
}

beforeEach(() => { vi.clearAllMocks(); });

describe("aiClassifyHandler", () => {
  it("returns early when categories are empty", async () => {
    const result = await aiClassifyHandler(makeNode({ categories: [] }), makeContext());
    expect(result.nextNodeId).toBeNull();
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("returns early when input text is empty", async () => {
    const result = await aiClassifyHandler(makeNode(), makeContext({ variables: { message: "" } }));
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("falls back to last user message when inputVariable not set", async () => {
    mockGenerateText.mockResolvedValue({ text: "positive" });
    await aiClassifyHandler(
      makeNode({ inputVariable: "" }),
      makeContext({ messageHistory: [{ role: "user", content: "I love it!" }] }),
    );
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: "user", content: expect.stringContaining("I love it!") }],
      }),
    );
  });

  it("classifies and routes to matching category edge", async () => {
    mockGenerateText.mockResolvedValue({ text: "positive" });
    const edges: FlowEdge[] = [
      { id: "e1", source: "cls-1", target: "pos-node", sourceHandle: "positive" },
      { id: "e2", source: "cls-1", target: "neg-node", sourceHandle: "negative" },
    ];
    const result = await aiClassifyHandler(
      makeNode(),
      makeContext({
        variables: { message: "This is great!" },
        flowContent: { nodes: [], edges, variables: [] },
      }),
    );
    expect(result.nextNodeId).toBe("pos-node");
    expect(result.updatedVariables?.["cls-1_classification"]).toBe("positive");
  });

  it("case-insensitive category matching", async () => {
    mockGenerateText.mockResolvedValue({ text: "  Positive  " });
    const edges: FlowEdge[] = [
      { id: "e1", source: "cls-1", target: "pos-node", sourceHandle: "positive" },
    ];
    const result = await aiClassifyHandler(
      makeNode(),
      makeContext({
        variables: { message: "Great!" },
        flowContent: { nodes: [], edges, variables: [] },
      }),
    );
    expect(result.nextNodeId).toBe("pos-node");
  });

  it("routes to else when AI returns unrecognized category", async () => {
    mockGenerateText.mockResolvedValue({ text: "unknown_category" });
    const edges: FlowEdge[] = [
      { id: "e1", source: "cls-1", target: "pos-node", sourceHandle: "positive" },
      { id: "e-else", source: "cls-1", target: "else-node", sourceHandle: "else" },
    ];
    const result = await aiClassifyHandler(
      makeNode(),
      makeContext({
        variables: { message: "ambiguous" },
        flowContent: { nodes: [], edges, variables: [] },
      }),
    );
    expect(result.nextNodeId).toBe("else-node");
    expect(result.updatedVariables?.["cls-1_classification"]).toBe("unknown_category");
  });

  it("falls through to default edge when no sourceHandle match", async () => {
    mockGenerateText.mockResolvedValue({ text: "unknown" });
    const edges: FlowEdge[] = [{ id: "e-def", source: "cls-1", target: "default-node" }];
    const result = await aiClassifyHandler(
      makeNode(),
      makeContext({
        variables: { message: "test" },
        flowContent: { nodes: [], edges, variables: [] },
      }),
    );
    expect(result.nextNodeId).toBe("default-node");
  });

  it("handles AI error gracefully", async () => {
    mockGenerateText.mockRejectedValue(new Error("API error"));
    const result = await aiClassifyHandler(
      makeNode(),
      makeContext({ variables: { message: "test" } }),
    );
    expect(result.nextNodeId).toBeNull();
    expect(result.messages).toHaveLength(0);
  });

  it("uses specified model", async () => {
    mockGenerateText.mockResolvedValue({ text: "positive" });
    await aiClassifyHandler(
      makeNode({ model: "gpt-4o" }),
      makeContext({ variables: { message: "test" } }),
    );
    expect(mockGetModel).toHaveBeenCalledWith("gpt-4o");
  });
});
