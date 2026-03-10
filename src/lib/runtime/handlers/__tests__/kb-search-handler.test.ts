import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FlowNode } from "@/types";
import type { RuntimeContext } from "../../types";

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const mockFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { knowledgeBase: { findUnique: (...args: unknown[]) => mockFindUnique(...args) } },
}));

const mockHybridSearch = vi.fn();
const mockComputeDynamicTopK = vi.fn().mockReturnValue(5);
const mockExpandChunks = vi.fn();
vi.mock("@/lib/knowledge/search", () => ({
  hybridSearch: (...args: unknown[]) => mockHybridSearch(...args),
  computeDynamicTopK: (...args: unknown[]) => mockComputeDynamicTopK(...args),
  expandChunksWithContext: (...args: unknown[]) => mockExpandChunks(...args),
}));

vi.mock("@/lib/analytics", () => ({
  trackKBSearch: vi.fn().mockResolvedValue(undefined),
}));

import { kbSearchHandler } from "../kb-search-handler";

function makeNode(overrides: Record<string, unknown> = {}): FlowNode {
  return {
    id: "kb-1",
    type: "kb_search",
    position: { x: 0, y: 0 },
    data: { label: "KB Search", topK: 5, queryVariable: "last_message", outputVariable: "kb_context", ...overrides },
  };
}

function makeContext(variables: Record<string, unknown> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: { nodes: [], edges: [], variables: [] },
    currentNodeId: "kb-1",
    variables,
    messageHistory: [],
    isNewConversation: false,
  };
}

beforeEach(() => { vi.clearAllMocks(); });

describe("kbSearchHandler", () => {
  it("returns empty results when query is empty", async () => {
    const result = await kbSearchHandler(makeNode(), makeContext({ last_message: "" }));
    expect(result.updatedVariables?.kb_results).toEqual([]);
    expect(result.updatedVariables?.kb_context).toBe("");
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns empty results when query variable is missing", async () => {
    const result = await kbSearchHandler(makeNode(), makeContext({}));
    expect(result.updatedVariables?.kb_results).toEqual([]);
  });

  it("returns empty results when knowledge base not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    const result = await kbSearchHandler(makeNode(), makeContext({ last_message: "test query" }));
    expect(result.updatedVariables?.kb_context).toBe("");
  });

  it("performs search and returns results", async () => {
    mockFindUnique.mockResolvedValue({ id: "kb-id-1" });
    const searchResults = [
      { chunkId: "c1", content: "Result 1", similarity: 0.9, sourceId: "s1", sourceDocument: "doc.pdf", relevanceScore: 0.015 },
      { chunkId: "c2", content: "Result 2", similarity: 0.8, sourceId: "s1", sourceDocument: "doc.pdf", relevanceScore: 0.010 },
    ];
    mockHybridSearch.mockResolvedValue(searchResults);
    mockExpandChunks.mockResolvedValue(searchResults);

    const result = await kbSearchHandler(makeNode(), makeContext({ last_message: "what is AI?" }));

    expect(mockHybridSearch).toHaveBeenCalledWith("what is AI?", "kb-id-1", { topK: 5 });
    expect(result.updatedVariables?.kb_context).toBe("Result 1\n---\nResult 2");
    const kbResults = result.updatedVariables?.kb_results as Array<Record<string, unknown>>;
    expect(kbResults).toHaveLength(2);
    expect(kbResults[0].content).toBe("Result 1");
  });

  it("uses template resolution when queryVariable contains {{", async () => {
    mockFindUnique.mockResolvedValue({ id: "kb-id-1" });
    mockHybridSearch.mockResolvedValue([]);
    mockExpandChunks.mockResolvedValue([]);

    await kbSearchHandler(
      makeNode({ queryVariable: "{{user_query}}" }),
      makeContext({ user_query: "resolved query" }),
    );

    expect(mockHybridSearch).toHaveBeenCalledWith("resolved query", "kb-id-1", expect.any(Object));
  });

  it("handles search errors gracefully", async () => {
    mockFindUnique.mockResolvedValue({ id: "kb-id-1" });
    mockHybridSearch.mockRejectedValue(new Error("Search failed"));

    const result = await kbSearchHandler(makeNode(), makeContext({ last_message: "test" }));
    expect(result.updatedVariables?.kb_results).toEqual([]);
    expect(result.updatedVariables?.kb_context).toBe("");
  });

  it("uses custom outputVariable name", async () => {
    mockFindUnique.mockResolvedValue({ id: "kb-id-1" });
    mockHybridSearch.mockResolvedValue([]);
    mockExpandChunks.mockResolvedValue([]);

    const result = await kbSearchHandler(
      makeNode({ outputVariable: "custom_context" }),
      makeContext({ last_message: "query" }),
    );
    expect(result.updatedVariables?.custom_context).toBe("");
  });
});
