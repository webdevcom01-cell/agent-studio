import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RAGInjectionOptions } from "../rag-inject";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    knowledgeBase: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../search", () => ({
  hybridSearch: vi.fn(),
  computeDynamicTopK: vi.fn().mockReturnValue(5),
  expandChunksWithContext: vi.fn(),
  sanitizeChunkContent: vi.fn((s: string) => s),
}));

vi.mock("../citations", () => ({
  extractCitations: vi.fn().mockReturnValue([]),
  formatCitationsForAI: vi.fn().mockReturnValue(""),
}));

vi.mock("@/lib/analytics", () => ({
  trackKBSearch: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { injectRAGContext } from "../rag-inject";
import { prisma } from "@/lib/prisma";
import { hybridSearch, expandChunksWithContext } from "../search";

const mockPrisma = vi.mocked(prisma);
const mockHybridSearch = vi.mocked(hybridSearch);
const mockExpand = vi.mocked(expandChunksWithContext);

const AGENT_ID = "agent-123";
const CONV_ID = "conv-456";
const KB_ID = "kb-789";

const mockKB = {
  id: KB_ID,
  _count: { sources: 2 },
};

const mockResults = [
  {
    chunkId: "c1",
    content: "HNSW is a graph-based approximate nearest neighbour index.",
    similarity: 0.9,
    sourceId: "s1",
    sourceDocument: "pgvector docs",
    relevanceScore: 0.9,
  },
  {
    chunkId: "c2",
    content: "IVFFlat partitions the vector space into lists.",
    similarity: 0.75,
    sourceId: "s2",
    sourceDocument: "pgvector docs",
    relevanceScore: 0.75,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

// ── No-op paths ───────────────────────────────────────────────────────────────

describe("injectRAGContext — early exit cases", () => {
  it("returns unchanged prompt when disabled option is set", async () => {
    const result = await injectRAGContext(
      AGENT_ID, "System prompt", "query", CONV_ID, { disabled: true },
    );
    expect(result.augmentedSystemPrompt).toBe("System prompt");
    expect(result.retrievedChunkCount).toBe(0);
    expect(result.knowledgeBaseId).toBeNull();
    expect(mockPrisma.knowledgeBase.findUnique).not.toHaveBeenCalled();
  });

  it("returns unchanged prompt when query is empty", async () => {
    const result = await injectRAGContext(AGENT_ID, "System prompt", "  ", CONV_ID);
    expect(result.augmentedSystemPrompt).toBe("System prompt");
    expect(result.retrievedChunkCount).toBe(0);
  });

  it("returns unchanged prompt when agent has no KB", async () => {
    mockPrisma.knowledgeBase.findUnique.mockResolvedValueOnce(null as never);

    const result = await injectRAGContext(AGENT_ID, "System prompt", "What is HNSW?", CONV_ID);
    expect(result.augmentedSystemPrompt).toBe("System prompt");
    expect(result.retrievedChunkCount).toBe(0);
    expect(result.knowledgeBaseId).toBeNull();
  });

  it("returns unchanged prompt when KB has no ready sources", async () => {
    mockPrisma.knowledgeBase.findUnique.mockResolvedValueOnce({
      id: KB_ID,
      _count: { sources: 0 },
    } as never);

    const result = await injectRAGContext(AGENT_ID, "System prompt", "What is HNSW?", CONV_ID);
    expect(result.augmentedSystemPrompt).toBe("System prompt");
    expect(result.knowledgeBaseId).toBe(KB_ID);
    expect(result.retrievedChunkCount).toBe(0);
  });

  it("returns unchanged prompt when hybrid search returns no results", async () => {
    mockPrisma.knowledgeBase.findUnique.mockResolvedValueOnce(mockKB as never);
    mockHybridSearch.mockResolvedValueOnce([]);

    const result = await injectRAGContext(AGENT_ID, "System prompt", "obscure query", CONV_ID);
    expect(result.augmentedSystemPrompt).toBe("System prompt");
    expect(result.retrievedChunkCount).toBe(0);
    expect(result.knowledgeBaseId).toBe(KB_ID);
  });
});

// ── Happy path ─────────────────────────────────────────────────────────────────

describe("injectRAGContext — successful retrieval", () => {
  beforeEach(() => {
    mockPrisma.knowledgeBase.findUnique.mockResolvedValue(mockKB as never);
    mockHybridSearch.mockResolvedValue(mockResults as never);
    mockExpand.mockResolvedValue(mockResults as never);
  });

  it("augments system prompt with knowledge base context", async () => {
    const result = await injectRAGContext(
      AGENT_ID, "You are a helpful assistant.", "How does HNSW work?", CONV_ID,
    );
    expect(result.augmentedSystemPrompt).toContain("You are a helpful assistant.");
    expect(result.augmentedSystemPrompt).toContain("<knowledge_base_context>");
    expect(result.augmentedSystemPrompt).toContain("</knowledge_base_context>");
    expect(result.augmentedSystemPrompt).toContain("HNSW is a graph-based");
  });

  it("returns correct chunk count and KB ID", async () => {
    const result = await injectRAGContext(
      AGENT_ID, "System prompt", "HNSW query", CONV_ID,
    );
    expect(result.retrievedChunkCount).toBe(2);
    expect(result.knowledgeBaseId).toBe(KB_ID);
  });

  it("records retrieval time", async () => {
    const result = await injectRAGContext(
      AGENT_ID, "System prompt", "HNSW query", CONV_ID,
    );
    expect(result.retrievalTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("respects custom topK option", async () => {
    const options: RAGInjectionOptions = { topK: 3 };
    await injectRAGContext(AGENT_ID, "System prompt", "HNSW query", CONV_ID, options);

    expect(mockHybridSearch).toHaveBeenCalledWith(
      "HNSW query",
      KB_ID,
      expect.objectContaining({ topK: 3 }),
    );
  });

  it("numbers each chunk in the output", async () => {
    const result = await injectRAGContext(
      AGENT_ID, "System prompt", "HNSW query", CONV_ID,
    );
    expect(result.augmentedSystemPrompt).toContain("[1]");
    expect(result.augmentedSystemPrompt).toContain("[2]");
  });
});

// ── Error handling ─────────────────────────────────────────────────────────────

describe("injectRAGContext — error handling", () => {
  it("returns original prompt when KB lookup throws", async () => {
    mockPrisma.knowledgeBase.findUnique.mockRejectedValueOnce(new Error("DB error"));

    const result = await injectRAGContext(
      AGENT_ID, "System prompt", "What is HNSW?", CONV_ID,
    );
    expect(result.augmentedSystemPrompt).toBe("System prompt");
    expect(result.retrievedChunkCount).toBe(0);
  });

  it("returns original prompt when hybrid search throws", async () => {
    mockPrisma.knowledgeBase.findUnique.mockResolvedValueOnce(mockKB as never);
    mockHybridSearch.mockRejectedValueOnce(new Error("Search error"));

    const result = await injectRAGContext(
      AGENT_ID, "System prompt", "What is HNSW?", CONV_ID,
    );
    expect(result.augmentedSystemPrompt).toBe("System prompt");
    expect(result.knowledgeBaseId).toBe(KB_ID);
  });
});
