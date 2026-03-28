import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({
  getModel: vi.fn(() => "mock-model"),
}));

import { semanticRouterHandler } from "../semantic-router-handler";
import { generateObject } from "ai";
import type { RuntimeContext } from "../../types";
import type { FlowNode, FlowContent } from "@/types";

const mockGenerateObject = vi.mocked(generateObject);

const ROUTES = [
  { id: "support", label: "Support", description: "Customer support", examples: ["help"] },
  { id: "sales", label: "Sales", description: "Sales queries", examples: ["pricing"] },
];

function makeNode(overrides: Record<string, unknown> = {}): FlowNode {
  return {
    id: "router-1",
    type: "semantic_router",
    position: { x: 0, y: 0 },
    data: {
      inputVariable: "user_message",
      routes: ROUTES,
      fallbackRoute: "fallback",
      model: "deepseek-chat",
      confidenceThreshold: 0.7,
      outputVariable: "router_result",
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
        { id: "e1", source: "router-1", target: "support-node", sourceHandle: "support" },
        { id: "e2", source: "router-1", target: "sales-node", sourceHandle: "sales" },
        { id: "e3", source: "router-1", target: "fallback-node", sourceHandle: "fallback" },
      ],
      variables: [],
    } as FlowContent,
    currentNodeId: "router-1",
    variables: { user_message: "I need help with billing" },
    messageHistory: [],
    isNewConversation: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("semanticRouterHandler", () => {
  it("returns error when no routes configured", async () => {
    const result = await semanticRouterHandler(
      makeNode({ routes: [] }),
      makeContext(),
    );
    expect(result.messages[0].content).toContain("no routes");
  });

  it("falls back when input variable is empty", async () => {
    const result = await semanticRouterHandler(
      makeNode(),
      makeContext({ variables: {} }),
    );
    expect(result.nextNodeId).toBe("fallback");
    expect(result.updatedVariables?.router_result).toEqual(
      expect.objectContaining({ selectedRoute: "fallback", confidence: 0 }),
    );
  });

  it("classifies clear intent to correct route", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        selectedRoute: "support",
        confidence: 0.92,
        reasoning: "User asked for help",
        allScores: [
          { route: "support", score: 0.92 },
          { route: "sales", score: 0.15 },
        ],
      },
      finishReason: "stop",
      usage: { promptTokens: 50, completionTokens: 30 },
      toJsonResponse: () => new Response(),
    } as ReturnType<typeof generateObject> extends Promise<infer T> ? T : never);

    const result = await semanticRouterHandler(makeNode(), makeContext());
    expect(result.nextNodeId).toBe("support");
    expect(result.updatedVariables?.router_result).toEqual(
      expect.objectContaining({ selectedRoute: "support", confidence: 0.92 }),
    );
  });

  it("falls back when confidence below threshold", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        selectedRoute: "support",
        confidence: 0.4,
        reasoning: "Ambiguous input",
        allScores: [
          { route: "support", score: 0.4 },
          { route: "sales", score: 0.35 },
        ],
      },
      finishReason: "stop",
      usage: { promptTokens: 50, completionTokens: 30 },
      toJsonResponse: () => new Response(),
    } as ReturnType<typeof generateObject> extends Promise<infer T> ? T : never);

    const result = await semanticRouterHandler(makeNode(), makeContext());
    expect(result.nextNodeId).toBe("fallback");
  });

  it("returns multi-route scores", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        selectedRoute: "sales",
        confidence: 0.85,
        reasoning: "Pricing inquiry",
        allScores: [
          { route: "support", score: 0.2 },
          { route: "sales", score: 0.85 },
        ],
      },
      finishReason: "stop",
      usage: { promptTokens: 50, completionTokens: 30 },
      toJsonResponse: () => new Response(),
    } as ReturnType<typeof generateObject> extends Promise<infer T> ? T : never);

    const result = await semanticRouterHandler(makeNode(), makeContext());
    const output = result.updatedVariables?.router_result as Record<string, unknown>;
    expect(output.allScores).toHaveLength(2);
  });

  it("resolves template variable in input", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        selectedRoute: "support",
        confidence: 0.9,
        reasoning: "Help request",
        allScores: [{ route: "support", score: 0.9 }],
      },
      finishReason: "stop",
      usage: { promptTokens: 50, completionTokens: 30 },
      toJsonResponse: () => new Response(),
    } as ReturnType<typeof generateObject> extends Promise<infer T> ? T : never);

    await semanticRouterHandler(makeNode(), makeContext());
    expect(mockGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("I need help with billing"),
      }),
    );
  });

  it("handles AI failure gracefully", async () => {
    mockGenerateObject.mockRejectedValueOnce(new Error("API error"));

    const result = await semanticRouterHandler(makeNode(), makeContext());
    expect(result.nextNodeId).toBe("fallback");
    const output = result.updatedVariables?.router_result as Record<string, unknown>;
    expect(output.reasoning).toContain("Classification failed");
  });
});
