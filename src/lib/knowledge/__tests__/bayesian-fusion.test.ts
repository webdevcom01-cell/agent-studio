import { describe, it, expect } from "vitest";
import { bayesianFusion } from "../search";
import type { SearchResult } from "../search";

function makeResult(chunkId: string, score: number, sourceId: string = "src-1"): SearchResult {
  return {
    chunkId,
    content: `Content for ${chunkId}`,
    similarity: score,
    sourceId,
    relevanceScore: score,
  };
}

describe("bayesianFusion", () => {
  it("returns empty array when both inputs are empty", () => {
    const result = bayesianFusion([], []);
    expect(result).toEqual([]);
  });

  it("returns semantic results when keyword results are empty", () => {
    const semantic = [makeResult("c1", 0.9), makeResult("c2", 0.7)];
    const result = bayesianFusion(semantic, [], 0.5, 0.5);
    expect(result).toHaveLength(2);
    // With 0.5 semantic weight and 0 keyword: score = 0.5 * semanticProb
    expect(result[0].chunkId).toBe("c1");
    expect(result[0].relevanceScore).toBeCloseTo(0.5 * 0.9, 4);
  });

  it("returns keyword results when semantic results are empty", () => {
    const keyword = [makeResult("c1", 0.8), makeResult("c2", 0.6)];
    const result = bayesianFusion([], keyword, 0.5, 0.5);
    expect(result).toHaveLength(2);
    // Rank 0 sigmoid calibrated score: 1 / (1 + exp(-(2.0 - 0.15 * 0))) = 1 / (1 + exp(-2.0))
    const expectedRank0 = 1.0 / (1.0 + Math.exp(-2.0));
    expect(result[0].relevanceScore).toBeCloseTo(0.5 * expectedRank0, 4);
  });

  it("merges overlapping chunks from both sources", () => {
    const semantic = [makeResult("c1", 0.9), makeResult("c2", 0.7)];
    const keyword = [makeResult("c1", 0.8), makeResult("c3", 0.5)];

    const result = bayesianFusion(semantic, keyword, 0.5, 0.5);
    expect(result).toHaveLength(3); // c1 (merged), c2 (semantic only), c3 (keyword only)

    const c1 = result.find((r) => r.chunkId === "c1");
    expect(c1).toBeDefined();

    // c1 has both semantic (0.9) and keyword rank 0 sigmoid
    const rank0Sigmoid = 1.0 / (1.0 + Math.exp(-2.0));
    const expectedScore = 0.5 * 0.9 + 0.5 * rank0Sigmoid;
    expect(c1!.relevanceScore).toBeCloseTo(expectedScore, 4);
  });

  it("assigns decreasing keyword scores based on rank position", () => {
    const keyword = [
      makeResult("c1", 0.9),
      makeResult("c2", 0.8),
      makeResult("c3", 0.7),
      makeResult("c4", 0.5),
    ];

    const result = bayesianFusion([], keyword, 0.0, 1.0);

    // With keyword weight = 1.0, scores should decrease with rank
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i].relevanceScore).toBeGreaterThan(result[i + 1].relevanceScore);
    }
  });

  it("sigmoid calibration produces values between 0 and 1", () => {
    // Generate 50 keyword results to test sigmoid at various ranks
    const keyword = Array.from({ length: 50 }, (_, i) =>
      makeResult(`c${i}`, 1.0 - i * 0.01),
    );

    const result = bayesianFusion([], keyword, 0.0, 1.0);
    for (const r of result) {
      expect(r.relevanceScore).toBeGreaterThan(0);
      expect(r.relevanceScore).toBeLessThanOrEqual(1);
    }
  });

  it("respects custom semantic/keyword weights", () => {
    const semantic = [makeResult("c1", 0.8)];
    const keyword = [makeResult("c1", 0.9)];

    // All semantic weight
    const semanticOnly = bayesianFusion(semantic, keyword, 1.0, 0.0);
    expect(semanticOnly[0].relevanceScore).toBeCloseTo(0.8, 4);

    // All keyword weight
    const keywordOnly = bayesianFusion(semantic, keyword, 0.0, 1.0);
    const rank0Sigmoid = 1.0 / (1.0 + Math.exp(-2.0));
    expect(keywordOnly[0].relevanceScore).toBeCloseTo(rank0Sigmoid, 4);
  });

  it("sorts final results by descending relevanceScore", () => {
    const semantic = [makeResult("c1", 0.3), makeResult("c2", 0.9)];
    const keyword = [makeResult("c3", 0.8), makeResult("c1", 0.7)];

    const result = bayesianFusion(semantic, keyword, 0.5, 0.5);
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i].relevanceScore).toBeGreaterThanOrEqual(result[i + 1].relevanceScore);
    }
  });

  it("uses default equal weights when not specified", () => {
    const semantic = [makeResult("c1", 0.8)];
    const keyword = [makeResult("c2", 0.9)];

    const result = bayesianFusion(semantic, keyword);
    expect(result).toHaveLength(2);
    // Both should have reasonable scores (not NaN or undefined)
    for (const r of result) {
      expect(r.relevanceScore).toBeGreaterThan(0);
      expect(Number.isFinite(r.relevanceScore)).toBe(true);
    }
  });

  it("handles high rank positions with graceful sigmoid decay", () => {
    // Rank 100: sigmoid(2.0 - 0.15*100) = sigmoid(-13) ≈ 0
    const keyword = Array.from({ length: 101 }, (_, i) =>
      makeResult(`c${i}`, 1.0),
    );

    const result = bayesianFusion([], keyword, 0.0, 1.0);
    const lastItem = result[result.length - 1];
    // Very high rank should have near-zero score
    expect(lastItem.relevanceScore).toBeLessThan(0.01);
  });

  it("preserves chunk metadata through fusion", () => {
    const semantic: SearchResult[] = [
      {
        chunkId: "c1",
        content: "Test content",
        similarity: 0.9,
        sourceId: "src-1",
        sourceDocument: "doc.pdf",
        sourceType: "FILE",
        pageNumber: 5,
        chunkIndex: 3,
        relevanceScore: 0.9,
        metadata: { section: "intro" },
      },
    ];

    const result = bayesianFusion(semantic, []);
    expect(result[0].sourceDocument).toBe("doc.pdf");
    expect(result[0].pageNumber).toBe(5);
    expect(result[0].metadata).toEqual({ section: "intro" });
  });
});
