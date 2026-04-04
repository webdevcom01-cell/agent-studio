/**
 * C3.4 — Bayesian fusion benchmark framework
 *
 * Compares bayesianFusion vs reciprocalRankFusion on synthetic datasets
 * with known ground-truth relevance labels, using standard IR metrics:
 *   - Precision@K  — fraction of top-K results that are truly relevant
 *   - NDCG@K       — Normalized Discounted Cumulative Gain
 *   - MRR          — Mean Reciprocal Rank (first-relevant position)
 *
 * Synthetic scenarios model realistic retrieval situations:
 *   - High-recall semantic, low-precision keyword (typical long-tail queries)
 *   - High-precision keyword, noisy semantic (keyword-dominant queries)
 *   - Balanced (both systems contribute)
 *
 * The tests assert quality thresholds, not exact scores, so they remain
 * valid if calibration parameters are tuned later.
 */

import { describe, it, expect } from "vitest";
import {
  bayesianFusion,
  reciprocalRankFusion,
  normalizeRRFScores,
} from "../search";
import type { SearchResult } from "../search";

// ── Benchmark utilities ─────────────────────────────────────────────────

/** Ground truth: set of chunk IDs considered relevant for a query */
type GroundTruth = Set<string>;

function makeResult(
  chunkId: string,
  score: number,
  sourceId = "src-1",
): SearchResult {
  return {
    chunkId,
    content: `Content for ${chunkId}`,
    similarity: score,
    sourceId,
    relevanceScore: score,
  };
}

/** Precision@K — fraction of top-K results that are in the ground truth */
function precisionAtK(results: SearchResult[], truth: GroundTruth, k: number): number {
  const topK = results.slice(0, k);
  const hits = topK.filter((r) => truth.has(r.chunkId)).length;
  return hits / k;
}

/** DCG@K — Discounted Cumulative Gain using binary relevance */
function dcgAtK(results: SearchResult[], truth: GroundTruth, k: number): number {
  return results.slice(0, k).reduce((sum, r, i) => {
    const rel = truth.has(r.chunkId) ? 1 : 0;
    return sum + rel / Math.log2(i + 2); // log2(rank + 1), rank is 1-indexed
  }, 0);
}

/** NDCG@K — DCG@K / ideal DCG (all relevant docs ranked first) */
function ndcgAtK(results: SearchResult[], truth: GroundTruth, k: number): number {
  const ideal = Array.from(truth)
    .slice(0, k)
    .reduce((sum, _, i) => sum + 1 / Math.log2(i + 2), 0);
  if (ideal === 0) return 0;
  return dcgAtK(results, truth, k) / ideal;
}

/** Mean Reciprocal Rank — 1 / position of first relevant result */
function mrr(results: SearchResult[], truth: GroundTruth): number {
  for (let i = 0; i < results.length; i++) {
    if (truth.has(results[i].chunkId)) return 1 / (i + 1);
  }
  return 0;
}

/** Run both fusion strategies and return their metrics side-by-side */
function benchmark(
  semanticResults: SearchResult[],
  keywordResults: SearchResult[],
  truth: GroundTruth,
  k: number,
  weights: { semantic: number; keyword: number } = { semantic: 0.7, keyword: 0.3 },
) {
  const bayesian = bayesianFusion(
    semanticResults,
    keywordResults,
    weights.semantic,
    weights.keyword,
  );

  const rrfRaw = reciprocalRankFusion(
    semanticResults,
    keywordResults,
    weights.semantic,
    weights.keyword,
  );
  const rrf = normalizeRRFScores(rrfRaw);

  return {
    bayesian: {
      p_at_k: precisionAtK(bayesian, truth, k),
      ndcg: ndcgAtK(bayesian, truth, k),
      mrr: mrr(bayesian, truth),
    },
    rrf: {
      p_at_k: precisionAtK(rrf, truth, k),
      ndcg: ndcgAtK(rrf, truth, k),
      mrr: mrr(rrf, truth),
    },
  };
}

// ── Synthetic dataset builder ───────────────────────────────────────────

/**
 * Build a synthetic retrieval scenario.
 *
 * @param totalChunks   — pool size
 * @param relevantIds   — IDs of truly relevant chunks
 * @param semanticOrder — chunk IDs ordered by semantic similarity (best first)
 * @param keywordOrder  — chunk IDs ordered by keyword/BM25 score (best first)
 * @param baseScore     — starting score (decremented per rank)
 */
function buildScenario(params: {
  semanticOrder: string[];
  keywordOrder: string[];
  relevantIds: string[];
}) {
  const { semanticOrder, keywordOrder, relevantIds } = params;

  const semantic = semanticOrder.map((id, i) =>
    makeResult(id, Math.max(0.1, 1.0 - i * 0.08)),
  );

  const keyword = keywordOrder.map((id, i) =>
    makeResult(id, Math.max(0.1, 1.0 - i * 0.08)),
  );

  const truth = new Set(relevantIds);

  return { semantic, keyword, truth };
}

// ── Benchmark tests ─────────────────────────────────────────────────────

describe("C3.4 — Bayesian fusion benchmark", () => {
  // ── Metric correctness ───────────────────────────────────────────────

  describe("benchmark metric correctness", () => {
    it("Precision@K computes correctly", () => {
      const results = [
        makeResult("c1", 0.9),
        makeResult("c2", 0.8),
        makeResult("c3", 0.7),
        makeResult("c4", 0.6),
      ];
      const truth = new Set(["c1", "c3"]);

      expect(precisionAtK(results, truth, 2)).toBeCloseTo(0.5); // 1/2 in top-2
      expect(precisionAtK(results, truth, 4)).toBeCloseTo(0.5); // 2/4 in top-4
    });

    it("NDCG@K is 1.0 when ranking matches ground truth perfectly", () => {
      const results = [
        makeResult("c1", 0.9),
        makeResult("c2", 0.8),
        makeResult("c3", 0.7),
      ];
      const truth = new Set(["c1", "c2", "c3"]);

      expect(ndcgAtK(results, truth, 3)).toBeCloseTo(1.0, 3);
    });

    it("NDCG@K is 0 when no relevant results in top-K", () => {
      const results = [
        makeResult("c1", 0.9),
        makeResult("c2", 0.8),
      ];
      const truth = new Set(["c5", "c6"]);

      expect(ndcgAtK(results, truth, 2)).toBe(0);
    });

    it("MRR is 1.0 when first result is relevant", () => {
      const results = [makeResult("c1", 0.9), makeResult("c2", 0.8)];
      const truth = new Set(["c1"]);

      expect(mrr(results, truth)).toBeCloseTo(1.0);
    });

    it("MRR is 0.5 when second result is first relevant", () => {
      const results = [makeResult("c1", 0.9), makeResult("c2", 0.8)];
      const truth = new Set(["c2"]);

      expect(mrr(results, truth)).toBeCloseTo(0.5);
    });
  });

  // ── Scenario 1: Semantic-dominant (typical open-ended query) ─────────

  describe("Scenario 1: Semantic-dominant retrieval", () => {
    // 12 chunks total: c1-c4 are relevant
    // Semantic: c1, c2, c3, c4 ranked 1-4 (captures ground truth well)
    // Keyword: c5, c6, c3, c7 ranked 1-4 (noisy — only c3 is relevant)
    const scenario = buildScenario({
      semanticOrder: ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"],
      keywordOrder:  ["c5", "c6", "c3", "c7", "c1", "c8", "c2", "c4"],
      relevantIds:   ["c1", "c2", "c3", "c4"],
    });

    it("bayesianFusion achieves P@4 ≥ 0.5", () => {
      const { bayesian } = benchmark(
        scenario.semantic,
        scenario.keyword,
        scenario.truth,
        4,
        { semantic: 0.7, keyword: 0.3 },
      );
      expect(bayesian.p_at_k).toBeGreaterThanOrEqual(0.5);
    });

    it("bayesianFusion achieves NDCG@4 ≥ 0.5", () => {
      const { bayesian } = benchmark(
        scenario.semantic,
        scenario.keyword,
        scenario.truth,
        4,
        { semantic: 0.7, keyword: 0.3 },
      );
      expect(bayesian.ndcg).toBeGreaterThanOrEqual(0.5);
    });

    it("bayesianFusion MRR ≥ 0.5 (relevant result in top-2)", () => {
      const { bayesian } = benchmark(
        scenario.semantic,
        scenario.keyword,
        scenario.truth,
        4,
        { semantic: 0.7, keyword: 0.3 },
      );
      expect(bayesian.mrr).toBeGreaterThanOrEqual(0.5);
    });
  });

  // ── Scenario 2: Keyword-dominant (exact-match query) ─────────────────

  describe("Scenario 2: Keyword-dominant retrieval", () => {
    // c1, c2 are relevant; keyword captures them perfectly, semantic is noisy
    const scenario = buildScenario({
      semanticOrder: ["c3", "c4", "c1", "c5", "c2", "c6", "c7", "c8"],
      keywordOrder:  ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"],
      relevantIds:   ["c1", "c2"],
    });

    it("bayesianFusion achieves P@2 ≥ 0.5 when keyword signal is strong", () => {
      const { bayesian } = benchmark(
        scenario.semantic,
        scenario.keyword,
        scenario.truth,
        2,
        { semantic: 0.3, keyword: 0.7 },
      );
      expect(bayesian.p_at_k).toBeGreaterThanOrEqual(0.5);
    });

    it("bayesianFusion MRR > 0 when keyword ranks relevant first", () => {
      const { bayesian } = benchmark(
        scenario.semantic,
        scenario.keyword,
        scenario.truth,
        4,
        { semantic: 0.3, keyword: 0.7 },
      );
      expect(bayesian.mrr).toBeGreaterThan(0);
    });
  });

  // ── Scenario 3: Balanced (both systems contribute complementary results) ─

  describe("Scenario 3: Balanced complementary retrieval", () => {
    // Non-overlapping sources: c1+c2 are relevant, appear only in semantic.
    // c3+c4 are relevant, appear only in keyword.
    // c5 is non-relevant, only in semantic. c6 is non-relevant, only in keyword.
    // This isolates each source's signal so no double-boost for non-relevant items.
    const scenario = buildScenario({
      semanticOrder: ["c1", "c2", "c5"],   // c1, c2 relevant; c5 not
      keywordOrder:  ["c3", "c4", "c6"],   // c3, c4 relevant; c6 not
      relevantIds:   ["c1", "c2", "c3", "c4"],
    });

    it("bayesianFusion retrieves chunks from both systems (union coverage)", () => {
      const fused = bayesianFusion(
        scenario.semantic,
        scenario.keyword,
        0.5,
        0.5,
      );
      // Should include chunks from both semantic-only and keyword-only sources
      const ids = new Set(fused.map((r) => r.chunkId));
      const hasSemanticRelevant = ids.has("c2");  // semantic-only relevant
      const hasKeywordRelevant  = ids.has("c4");  // keyword-only relevant
      expect(hasSemanticRelevant && hasKeywordRelevant).toBe(true);
    });

    it("bayesianFusion P@4 ≥ 0.5 with balanced weights (complementary sources)", () => {
      const { bayesian } = benchmark(
        scenario.semantic,
        scenario.keyword,
        scenario.truth,
        4,
        { semantic: 0.5, keyword: 0.5 },
      );
      // With 4 relevant chunks across 6 total, top-4 should achieve ≥ 50% precision
      expect(bayesian.p_at_k).toBeGreaterThanOrEqual(0.5);
    });
  });

  // ── Calibration parameter validation ─────────────────────────────────

  describe("sigmoid calibration parameter validation (a=2.0, b=0.15)", () => {
    it("rank-0 calibrated score ≈ 0.880 (sigmoid at 2.0)", () => {
      // sigmoid(2.0 - 0.15 * 0) = sigmoid(2.0) = 1 / (1 + e^-2)
      const expected = 1 / (1 + Math.exp(-2.0));
      const result = bayesianFusion([], [makeResult("c1", 1.0)], 0.0, 1.0);
      expect(result[0].relevanceScore).toBeCloseTo(expected, 4);
    });

    it("rank-13 calibrated score ≈ 0.5 (sigmoid crossover)", () => {
      // sigmoid(2.0 - 0.15 * 13) = sigmoid(0.05) ≈ 0.5125
      // We verify it's near 0.5, i.e., the boundary of relevance
      const keyword = Array.from({ length: 20 }, (_, i) =>
        makeResult(`c${i}`, 1.0),
      );
      const result = bayesianFusion([], keyword, 0.0, 1.0);
      const rank13 = result.find((r) => r.chunkId === "c13");
      expect(rank13).toBeDefined();
      expect(rank13!.relevanceScore).toBeCloseTo(0.5, 1); // within ±0.05 of 0.5
    });

    it("rank-40+ calibrated score < 0.1 (rapid decay beyond sigmoid knee)", () => {
      const keyword = Array.from({ length: 50 }, (_, i) =>
        makeResult(`c${i}`, 1.0),
      );
      const result = bayesianFusion([], keyword, 0.0, 1.0);
      const rank40 = result.find((r) => r.chunkId === "c40");
      expect(rank40).toBeDefined();
      expect(rank40!.relevanceScore).toBeLessThan(0.1);
    });
  });

  // ── Comparative: Bayesian vs RRF on worst-case RRF scenario ──────────

  describe("Comparative: bayesian vs RRF (scale-mismatch scenario)", () => {
    // RRF is known to treat all rank positions as equally spaced.
    // In a scale-mismatch case (semantic scores concentrated near 0 while
    // keyword scores are uniformly spread), Bayesian should better preserve
    // the semantic ordering than RRF does.
    it("bayesian fusion produces finite, bounded scores [0, 1]", () => {
      const semantic = Array.from({ length: 10 }, (_, i) =>
        makeResult(`c${i}`, 0.01 + i * 0.005), // very low, clustered scores
      );
      const keyword = Array.from({ length: 10 }, (_, i) =>
        makeResult(`k${i}`, 1.0 - i * 0.1), // uniformly spread
      );

      const result = bayesianFusion(semantic, keyword, 0.7, 0.3);

      for (const r of result) {
        expect(r.relevanceScore).toBeGreaterThanOrEqual(0);
        expect(r.relevanceScore).toBeLessThanOrEqual(1);
        expect(Number.isFinite(r.relevanceScore)).toBe(true);
        expect(Number.isNaN(r.relevanceScore)).toBe(false);
      }
    });

    it("both strategies return the same unique chunk IDs for the same inputs", () => {
      const semantic = [makeResult("c1", 0.9), makeResult("c2", 0.7), makeResult("c3", 0.5)];
      const keyword  = [makeResult("c2", 0.8), makeResult("c4", 0.6), makeResult("c3", 0.4)];

      const bayesian = bayesianFusion(semantic, keyword, 0.5, 0.5);
      const rrfRaw   = reciprocalRankFusion(semantic, keyword, 0.5, 0.5);
      const rrf      = normalizeRRFScores(rrfRaw);

      const bayesianIds = new Set(bayesian.map((r) => r.chunkId));
      const rrfIds      = new Set(rrf.map((r) => r.chunkId));

      // Both must cover the full union of chunks (c1, c2, c3, c4)
      for (const id of ["c1", "c2", "c3", "c4"]) {
        expect(bayesianIds.has(id)).toBe(true);
        expect(rrfIds.has(id)).toBe(true);
      }
    });
  });
});
