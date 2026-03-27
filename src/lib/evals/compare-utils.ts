/**
 * Eval Compare Utilities
 *
 * Exported helpers for the A/B comparison route and unit tests.
 * Separated from compare/route.ts because Next.js route files must only
 * export HTTP handler functions (GET, POST, etc.).
 */

import type {
  AssertionLayerBreakdown,
  AssertionResult,
  ComparisonDelta,
} from "./schemas";
import { getAssertionLayer, ASSERTION_LAYERS } from "./schemas";
import type { EvalRunSummary } from "./runner";

// ─── Raw DB result types ───────────────────────────────────────────────────────

/** Raw DB result row for assertion breakdown computation. */
export interface RawEvalResult {
  testCaseId: string;
  assertions: unknown; // JSON field — AssertionResult[]
}

// ─── Assertion parsing ─────────────────────────────────────────────────────────

export function parseAssertionResults(raw: unknown): AssertionResult[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (r): r is AssertionResult =>
      typeof r === "object" && r !== null && "type" in r && "passed" in r && "score" in r,
  );
}

// ─── Assertion layer breakdown ─────────────────────────────────────────────────

/**
 * Build the per-layer assertion breakdown comparing two sets of eval results.
 * Groups all assertion-level scores by L1/L2/L3 and computes per-layer metrics.
 */
export function buildAssertionBreakdown(
  rawA: RawEvalResult[],
  rawB: RawEvalResult[],
): AssertionLayerBreakdown[] {
  // Build map from testCaseId → assertions for fast lookup
  const mapB = new Map<string, AssertionResult[]>(
    rawB.map((r) => [r.testCaseId, parseAssertionResults(r.assertions)]),
  );

  // Per-layer accumulators
  type LayerBucket = {
    scoresA: number[];
    scoresB: number[];
    types: Set<string>;
    aWins: number;
    bWins: number;
    ties: number;
  };

  const buckets: Record<string, LayerBucket> = {
    L1: { scoresA: [], scoresB: [], types: new Set(), aWins: 0, bWins: 0, ties: 0 },
    L2: { scoresA: [], scoresB: [], types: new Set(), aWins: 0, bWins: 0, ties: 0 },
    L3: { scoresA: [], scoresB: [], types: new Set(), aWins: 0, bWins: 0, ties: 0 },
  };

  for (const resultA of rawA) {
    const assertionsA = parseAssertionResults(resultA.assertions);
    const assertionsB = mapB.get(resultA.testCaseId) ?? [];

    const maxLen = Math.max(assertionsA.length, assertionsB.length);
    for (let i = 0; i < maxLen; i++) {
      const asr = assertionsA[i];
      const bsr = assertionsB[i];
      if (!asr && !bsr) continue;

      const assertionType = asr?.type ?? bsr?.type ?? "unknown";
      const layer = getAssertionLayer(assertionType);
      const bucket = buckets[layer];

      if (!bucket) continue;

      const scoreA = asr?.score ?? 0;
      const scoreB = bsr?.score ?? 0;

      bucket.types.add(assertionType);
      bucket.scoresA.push(scoreA);
      bucket.scoresB.push(scoreB);

      if (scoreA > scoreB) bucket.aWins++;
      else if (scoreB > scoreA) bucket.bWins++;
      else bucket.ties++;
    }
  }

  const avg = (nums: number[]): number =>
    nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length;

  const result: AssertionLayerBreakdown[] = [];

  for (const layerKey of ["L1", "L2", "L3"] as const) {
    const bucket = buckets[layerKey];
    if (bucket.scoresA.length === 0 && bucket.scoresB.length === 0) continue;

    const avgScoreA = avg(bucket.scoresA);
    const avgScoreB = avg(bucket.scoresB);

    result.push({
      layer: layerKey,
      layerLabel: ASSERTION_LAYERS[layerKey].label,
      assertionTypes: Array.from(bucket.types).sort(),
      totalAssertions: Math.max(bucket.scoresA.length, bucket.scoresB.length),
      avgScoreA: Math.round(avgScoreA * 1000) / 1000,
      avgScoreB: Math.round(avgScoreB * 1000) / 1000,
      scoreDelta: Math.round((avgScoreB - avgScoreA) * 1000) / 1000,
      aWins: bucket.aWins,
      bWins: bucket.bWins,
      ties: bucket.ties,
    });
  }

  return result;
}

// ─── Delta calculator ──────────────────────────────────────────────────────────

export function calculateDelta(
  summaryA: EvalRunSummary,
  summaryB: EvalRunSummary,
  rawResultsA: RawEvalResult[] = [],
  rawResultsB: RawEvalResult[] = [],
): ComparisonDelta {
  let aWins = 0;
  let bWins = 0;
  let ties = 0;

  // Compare per-case scores
  const casesA = summaryA.results;
  const casesB = summaryB.results;

  const maxLen = Math.max(casesA.length, casesB.length);
  for (let i = 0; i < maxLen; i++) {
    const scoreA = casesA[i]?.score ?? 0;
    const scoreB = casesB[i]?.score ?? 0;
    if (scoreA > scoreB) aWins++;
    else if (scoreB > scoreA) bWins++;
    else ties++;
  }

  // Average latency
  const avgLatencyA =
    casesA.length > 0
      ? casesA.reduce((acc, c) => acc + c.latencyMs, 0) / casesA.length
      : 0;
  const avgLatencyB =
    casesB.length > 0
      ? casesB.reduce((acc, c) => acc + c.latencyMs, 0) / casesB.length
      : 0;

  const scoreDiff = summaryA.score - summaryB.score;
  const winner: "a" | "b" | "tie" =
    aWins > bWins ? "a" : bWins > aWins ? "b" : "tie";

  // Build assertion-level breakdown
  const assertionBreakdown = buildAssertionBreakdown(rawResultsA, rawResultsB);

  return {
    scoreDiff: Math.round(scoreDiff * 1000) / 1000,
    latencyDiffMs: Math.round(avgLatencyA - avgLatencyB),
    aWins,
    bWins,
    ties,
    winner,
    assertionBreakdown,
  };
}
