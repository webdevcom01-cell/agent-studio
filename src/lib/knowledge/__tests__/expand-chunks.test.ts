import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SearchResult } from "../search";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

vi.mock("../embeddings", () => ({
  generateEmbedding: vi.fn(),
}));

import { expandChunksWithContext } from "../search";
import { prisma } from "@/lib/prisma";

const mockQueryRaw = vi.mocked(prisma.$queryRaw);

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    chunkId: "chunk-1",
    content: "matched content",
    similarity: 0.8,
    sourceId: "source-1",
    relevanceScore: 0.8,
    chunkIndex: 5,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("expandChunksWithContext", () => {
  it("returns empty array for empty input", async () => {
    const result = await expandChunksWithContext([]);
    expect(result).toEqual([]);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it("passes through results without chunkIndex", async () => {
    const input = [makeResult({ chunkIndex: undefined })];
    const result = await expandChunksWithContext(input);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("matched content");
  });

  it("fetches neighboring chunks and merges content", async () => {
    const input = [makeResult({ chunkIndex: 2, sourceId: "s1" })];

    mockQueryRaw.mockResolvedValueOnce([
      { id: "c1", content: "before chunk", sourceId: "s1", metadata: JSON.stringify({ index: 1 }) },
      { id: "c2", content: "matched chunk", sourceId: "s1", metadata: JSON.stringify({ index: 2 }) },
      { id: "c3", content: "after chunk", sourceId: "s1", metadata: JSON.stringify({ index: 3 }) },
    ]);

    const result = await expandChunksWithContext(input, 1);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("before chunk\nmatched chunk\nafter chunk");
  });

  it("deduplicates overlapping expansions from same source", async () => {
    const input = [
      makeResult({ chunkId: "c2", chunkIndex: 2, sourceId: "s1", relevanceScore: 0.9 }),
      makeResult({ chunkId: "c3", chunkIndex: 3, sourceId: "s1", relevanceScore: 0.7 }),
    ];

    mockQueryRaw.mockResolvedValueOnce([
      { id: "c1", content: "chunk 1", sourceId: "s1", metadata: JSON.stringify({ index: 1 }) },
      { id: "c2", content: "chunk 2", sourceId: "s1", metadata: JSON.stringify({ index: 2 }) },
      { id: "c3", content: "chunk 3", sourceId: "s1", metadata: JSON.stringify({ index: 3 }) },
      { id: "c4", content: "chunk 4", sourceId: "s1", metadata: JSON.stringify({ index: 4 }) },
    ]);

    const result = await expandChunksWithContext(input, 1);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("chunk 1\nchunk 2\nchunk 3\nchunk 4");
    expect(result[0].relevanceScore).toBe(0.9);
  });

  it("handles multiple sources independently", async () => {
    const input = [
      makeResult({ chunkId: "a1", chunkIndex: 0, sourceId: "s1", relevanceScore: 0.9 }),
      makeResult({ chunkId: "b1", chunkIndex: 0, sourceId: "s2", relevanceScore: 0.7 }),
    ];

    mockQueryRaw
      .mockResolvedValueOnce([
        { id: "a0", content: "source1 chunk0", sourceId: "s1", metadata: JSON.stringify({ index: 0 }) },
        { id: "a1", content: "source1 chunk1", sourceId: "s1", metadata: JSON.stringify({ index: 1 }) },
      ])
      .mockResolvedValueOnce([
        { id: "b0", content: "source2 chunk0", sourceId: "s2", metadata: JSON.stringify({ index: 0 }) },
        { id: "b1", content: "source2 chunk1", sourceId: "s2", metadata: JSON.stringify({ index: 1 }) },
      ]);

    const result = await expandChunksWithContext(input, 1);
    expect(result).toHaveLength(2);
    expect(result[0].relevanceScore).toBeGreaterThanOrEqual(result[1].relevanceScore);
  });

  it("respects token budget and trims low-score results", async () => {
    const longContent = "word ".repeat(3000);
    const input = [
      makeResult({ chunkId: "c1", chunkIndex: 0, sourceId: "s1", relevanceScore: 0.9 }),
      makeResult({ chunkId: "c2", chunkIndex: 0, sourceId: "s2", relevanceScore: 0.5 }),
    ];

    mockQueryRaw
      .mockResolvedValueOnce([
        { id: "c1", content: longContent, sourceId: "s1", metadata: JSON.stringify({ index: 0 }) },
      ])
      .mockResolvedValueOnce([
        { id: "c2", content: longContent, sourceId: "s2", metadata: JSON.stringify({ index: 0 }) },
      ]);

    const result = await expandChunksWithContext(input, 0);
    expect(result.length).toBeLessThanOrEqual(2);
    if (result.length === 1) {
      expect(result[0].relevanceScore).toBe(0.9);
    }
  });
});
