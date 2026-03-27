import { describe, it, expect } from "vitest";
import { computeDynamicTopK, reciprocalRankFusion, sanitizeChunkContent, type SearchResult } from "../search";

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    chunkId: "chunk-1",
    content: "test content",
    similarity: 0.8,
    sourceId: "source-1",
    relevanceScore: 0.8,
    chunkIndex: 0,
    ...overrides,
  };
}

describe("sanitizeChunkContent", () => {
  it("escapes HTML special characters", () => {
    expect(sanitizeChunkContent('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  it("escapes ampersands", () => {
    expect(sanitizeChunkContent("Tom & Jerry")).toBe("Tom &amp; Jerry");
  });

  it("escapes single quotes", () => {
    expect(sanitizeChunkContent("it's")).toBe("it&#x27;s");
  });

  it("returns plain text unchanged", () => {
    expect(sanitizeChunkContent("hello world")).toBe("hello world");
  });

  it("handles empty string", () => {
    expect(sanitizeChunkContent("")).toBe("");
  });

  it("escapes all special chars in one string", () => {
    expect(sanitizeChunkContent(`<a href="x" data-v='y'>&`)).toBe(
      '&lt;a href=&quot;x&quot; data-v=&#x27;y&#x27;&gt;&amp;'
    );
  });
});

describe("computeDynamicTopK", () => {
  it("returns 3 for short queries (1-3 words)", () => {
    expect(computeDynamicTopK("pricing", 7)).toBe(3);
    expect(computeDynamicTopK("api docs", 7)).toBe(3);
    expect(computeDynamicTopK("how much cost", 7)).toBe(3);
  });

  it("returns 5 for medium queries (4-8 words)", () => {
    expect(computeDynamicTopK("how to set up agent", 7)).toBe(5);
    expect(computeDynamicTopK("what is the best model for", 7)).toBe(5);
  });

  it("returns 7 for long queries (9+ words)", () => {
    expect(computeDynamicTopK("how do I set up a knowledge base search node that loops back", 7)).toBe(7);
  });

  it("respects configuredTopK as upper bound", () => {
    expect(computeDynamicTopK("pricing", 2)).toBe(2);
    expect(computeDynamicTopK("how to set up agent", 3)).toBe(3);
    expect(computeDynamicTopK("how do I set up a knowledge base search node that loops back", 4)).toBe(4);
  });

  it("handles empty query", () => {
    expect(computeDynamicTopK("", 7)).toBe(3);
  });

  it("handles whitespace-only query", () => {
    expect(computeDynamicTopK("   ", 7)).toBe(3);
  });
});

describe("reciprocalRankFusion with 70/30 weights", () => {
  it("gives higher score to semantic-only results than keyword-only", () => {
    const semanticOnly = [makeResult({ chunkId: "sem-1" })];
    const keywordOnly = [makeResult({ chunkId: "kw-1" })];

    const fused = reciprocalRankFusion(semanticOnly, keywordOnly, 0.7, 0.3);

    const semResult = fused.find((r) => r.chunkId === "sem-1")!;
    const kwResult = fused.find((r) => r.chunkId === "kw-1")!;
    expect(semResult.relevanceScore).toBeGreaterThan(kwResult.relevanceScore);
  });

  it("boosts results found in both semantic and keyword", () => {
    const shared = makeResult({ chunkId: "shared-1" });
    const semanticResults = [shared];
    const keywordResults = [{ ...shared }];

    const fused = reciprocalRankFusion(semanticResults, keywordResults, 0.7, 0.3);
    const semOnlyFused = reciprocalRankFusion(semanticResults, [], 0.7, 0.3);

    expect(fused[0].relevanceScore).toBeGreaterThan(semOnlyFused[0].relevanceScore);
  });
});
