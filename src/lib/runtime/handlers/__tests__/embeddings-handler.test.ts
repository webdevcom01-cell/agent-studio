import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerateEmbedding = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
const mockGenerateEmbeddings = vi.fn().mockResolvedValue([
  [0.1, 0.2, 0.3],
  [0.4, 0.5, 0.6],
]);

vi.mock("@/lib/knowledge/embeddings", () => ({
  generateEmbedding: (...args: unknown[]) => mockGenerateEmbedding(...args),
  generateEmbeddings: (...args: unknown[]) => mockGenerateEmbeddings(...args),
}));

import { embeddingsHandler } from "../embeddings-handler";
import type { RuntimeContext } from "../../types";
import type { FlowNode, FlowContent } from "@/types";

function makeNode(overrides: Record<string, unknown> = {}): FlowNode {
  return {
    id: "embed-1",
    type: "embeddings",
    position: { x: 0, y: 0 },
    data: {
      inputText: "Hello world",
      outputVariable: "embedding_result",
      mode: "single",
      ...overrides,
    },
  };
}

function makeContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: { nodes: [], edges: [], variables: [] } as FlowContent,
    currentNodeId: "embed-1",
    variables: {},
    messageHistory: [],
    isNewConversation: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("embeddingsHandler", () => {
  it("returns error when input text is empty", async () => {
    const result = await embeddingsHandler(
      makeNode({ inputText: "" }),
      makeContext(),
    );
    expect(result.messages[0].content).toContain("no input text");
  });

  it("generates single embedding", async () => {
    const result = await embeddingsHandler(makeNode(), makeContext());
    expect(result.updatedVariables?.embedding_result).toEqual([0.1, 0.2, 0.3]);
    expect(result.updatedVariables?.embedding_result_dimensions).toBe(3);
    expect(mockGenerateEmbedding).toHaveBeenCalledWith("Hello world", undefined);
  });

  it("generates batch embeddings", async () => {
    const result = await embeddingsHandler(
      makeNode({ mode: "batch", inputText: "line one\nline two" }),
      makeContext(),
    );
    expect(result.updatedVariables?.embedding_result).toHaveLength(2);
    expect(result.updatedVariables?.embedding_result_count).toBe(2);
    expect(mockGenerateEmbeddings).toHaveBeenCalledWith(
      ["line one", "line two"],
      undefined,
    );
  });

  it("returns empty array for batch with blank lines only", async () => {
    const result = await embeddingsHandler(
      makeNode({ mode: "batch", inputText: "\n\n  \n" }),
      makeContext(),
    );
    expect(result.updatedVariables?.embedding_result).toEqual([]);
    expect(result.updatedVariables?.embedding_result_count).toBe(0);
  });

  it("resolves template variables in input", async () => {
    await embeddingsHandler(
      makeNode({ inputText: "{{query}}" }),
      makeContext({ variables: { query: "test query" } }),
    );
    expect(mockGenerateEmbedding).toHaveBeenCalledWith("test query", undefined);
  });

  it("handles embedding failure gracefully", async () => {
    mockGenerateEmbedding.mockRejectedValueOnce(new Error("API error"));

    const result = await embeddingsHandler(makeNode(), makeContext());
    expect(result.updatedVariables?.embedding_result).toContain("[Error:");
  });
});
