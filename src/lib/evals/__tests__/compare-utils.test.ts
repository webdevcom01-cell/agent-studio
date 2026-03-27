/**
 * Tests for compare-utils: assertion layer classification + breakdown computation.
 * Covers: getAssertionLayer, buildAssertionBreakdown, calculateDelta winner logic.
 */
import { describe, it, expect } from "vitest";
import { getAssertionLayer } from "../schemas";
import { buildAssertionBreakdown, parseAssertionResults, calculateDelta } from "../compare-utils";
import type { RawEvalResult } from "../compare-utils";
import type { EvalRunSummary } from "../runner";

// ─── getAssertionLayer ────────────────────────────────────────────────────────

describe("getAssertionLayer", () => {
  it("classifies L1 deterministic types correctly", () => {
    const l1Types = [
      "exact_match", "contains", "icontains", "not_contains",
      "regex", "starts_with", "json_valid", "latency",
    ];
    for (const type of l1Types) {
      expect(getAssertionLayer(type)).toBe("L1");
    }
  });

  it("classifies L2 semantic similarity correctly", () => {
    expect(getAssertionLayer("semantic_similarity")).toBe("L2");
  });

  it("classifies L3 LLM judge types correctly", () => {
    expect(getAssertionLayer("llm_rubric")).toBe("L3");
    expect(getAssertionLayer("kb_faithfulness")).toBe("L3");
    expect(getAssertionLayer("relevance")).toBe("L3");
  });

  it("defaults unknown types to L3 (conservative)", () => {
    expect(getAssertionLayer("unknown_type")).toBe("L3");
    expect(getAssertionLayer("custom_evaluator")).toBe("L3");
    expect(getAssertionLayer("")).toBe("L3");
  });
});

// ─── parseAssertionResults ────────────────────────────────────────────────────

describe("parseAssertionResults", () => {
  it("returns empty array for non-array input", () => {
    expect(parseAssertionResults(null)).toEqual([]);
    expect(parseAssertionResults(undefined)).toEqual([]);
    expect(parseAssertionResults("string")).toEqual([]);
    expect(parseAssertionResults(42)).toEqual([]);
  });

  it("filters out items missing required fields", () => {
    const raw = [
      { type: "contains", passed: true, score: 1, message: "ok" },  // valid
      { type: "contains", passed: true },  // missing score — filtered
      { passed: true, score: 0.5, message: "ok" },  // missing type — filtered
      null,
      42,
    ];
    const result = parseAssertionResults(raw);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: "contains", passed: true, score: 1 });
  });

  it("returns all valid assertion results", () => {
    const raw = [
      { type: "contains", passed: true, score: 1, message: "pass" },
      { type: "llm_rubric", passed: false, score: 0.4, message: "fail" },
    ];
    const result = parseAssertionResults(raw);
    expect(result).toHaveLength(2);
  });
});

// ─── buildAssertionBreakdown ──────────────────────────────────────────────────

const makeResult = (
  testCaseId: string,
  assertions: { type: string; passed: boolean; score: number; message: string }[],
): RawEvalResult => ({ testCaseId, assertions });

describe("buildAssertionBreakdown", () => {
  it("returns empty array when both inputs are empty", () => {
    expect(buildAssertionBreakdown([], [])).toEqual([]);
  });

  it("groups L1 assertions in L1 layer bucket", () => {
    const rawA: RawEvalResult[] = [
      makeResult("tc1", [
        { type: "contains", passed: true, score: 1, message: "ok" },
      ]),
    ];
    const rawB: RawEvalResult[] = [
      makeResult("tc1", [
        { type: "contains", passed: false, score: 0, message: "fail" },
      ]),
    ];

    const breakdown = buildAssertionBreakdown(rawA, rawB);
    expect(breakdown).toHaveLength(1);

    const l1 = breakdown.find((b) => b.layer === "L1");
    expect(l1).toBeDefined();
    expect(l1?.assertionTypes).toContain("contains");
    expect(l1?.avgScoreA).toBe(1);
    expect(l1?.avgScoreB).toBe(0);
    expect(l1?.scoreDelta).toBe(-1); // B is worse
    expect(l1?.aWins).toBe(1);
    expect(l1?.bWins).toBe(0);
    expect(l1?.ties).toBe(0);
  });

  it("separates L1 and L3 assertions into distinct layer entries", () => {
    const rawA: RawEvalResult[] = [
      makeResult("tc1", [
        { type: "contains", passed: true, score: 1, message: "ok" },  // L1
        { type: "llm_rubric", passed: true, score: 0.9, message: "good" },  // L3
      ]),
    ];
    const rawB: RawEvalResult[] = [
      makeResult("tc1", [
        { type: "contains", passed: true, score: 0.8, message: "ok" },  // L1
        { type: "llm_rubric", passed: true, score: 1.0, message: "great" },  // L3
      ]),
    ];

    const breakdown = buildAssertionBreakdown(rawA, rawB);
    expect(breakdown.length).toBeGreaterThanOrEqual(2);

    const l1 = breakdown.find((b) => b.layer === "L1");
    const l3 = breakdown.find((b) => b.layer === "L3");

    expect(l1?.avgScoreA).toBe(1);
    expect(l1?.avgScoreB).toBeCloseTo(0.8);
    expect(l1?.aWins).toBe(1); // A wins L1

    expect(l3?.avgScoreA).toBeCloseTo(0.9);
    expect(l3?.avgScoreB).toBe(1);
    expect(l3?.bWins).toBe(1); // B wins L3
  });

  it("computes ties correctly when scores are equal", () => {
    const rawA: RawEvalResult[] = [
      makeResult("tc1", [
        { type: "contains", passed: true, score: 1, message: "ok" },
      ]),
    ];
    const rawB: RawEvalResult[] = [
      makeResult("tc1", [
        { type: "contains", passed: true, score: 1, message: "ok" },
      ]),
    ];

    const breakdown = buildAssertionBreakdown(rawA, rawB);
    const l1 = breakdown.find((b) => b.layer === "L1");
    expect(l1?.ties).toBe(1);
    expect(l1?.aWins).toBe(0);
    expect(l1?.bWins).toBe(0);
    expect(l1?.scoreDelta).toBe(0);
  });

  it("handles multiple test cases correctly — aggregates across cases", () => {
    const rawA: RawEvalResult[] = [
      makeResult("tc1", [{ type: "contains", passed: true, score: 1, message: "ok" }]),
      makeResult("tc2", [{ type: "contains", passed: false, score: 0, message: "fail" }]),
    ];
    const rawB: RawEvalResult[] = [
      makeResult("tc1", [{ type: "contains", passed: true, score: 0.5, message: "partial" }]),
      makeResult("tc2", [{ type: "contains", passed: true, score: 1, message: "ok" }]),
    ];

    const breakdown = buildAssertionBreakdown(rawA, rawB);
    const l1 = breakdown.find((b) => b.layer === "L1");

    // tc1: A=1, B=0.5 → A wins; tc2: A=0, B=1 → B wins
    expect(l1?.aWins).toBe(1);
    expect(l1?.bWins).toBe(1);
    expect(l1?.ties).toBe(0);
    // avgScoreA = (1 + 0) / 2 = 0.5; avgScoreB = (0.5 + 1) / 2 = 0.75
    expect(l1?.avgScoreA).toBeCloseTo(0.5);
    expect(l1?.avgScoreB).toBeCloseTo(0.75);
    expect(l1?.scoreDelta).toBeCloseTo(0.25); // B improved
  });

  it("includes layerLabel matching ASSERTION_LAYERS", () => {
    const rawA: RawEvalResult[] = [
      makeResult("tc1", [{ type: "contains", passed: true, score: 1, message: "ok" }]),
    ];
    const rawB: RawEvalResult[] = [
      makeResult("tc1", [{ type: "contains", passed: true, score: 1, message: "ok" }]),
    ];
    const breakdown = buildAssertionBreakdown(rawA, rawB);
    const l1 = breakdown.find((b) => b.layer === "L1");
    expect(l1?.layerLabel).toBe("Deterministic");
  });
});

// ─── calculateDelta — winner logic ───────────────────────────────────────────

const makeSummary = (
  runId: string,
  score: number,
  results: { score: number; latencyMs: number }[],
): EvalRunSummary => ({
  runId,
  status: "COMPLETED",
  totalCases: results.length,
  passedCases: results.filter((r) => r.score >= 1).length,
  failedCases: results.filter((r) => r.score < 1).length,
  score,
  durationMs: 1000,
  results: results.map((r, i) => ({
    testCaseId: `tc${i + 1}`,
    label: `Case ${i + 1}`,
    status: r.score >= 1 ? ("PASSED" as const) : ("FAILED" as const),
    agentOutput: "output",
    score: r.score,
    latencyMs: r.latencyMs,
    assertionResults: [],
  })),
});

describe("calculateDelta — winner determination", () => {
  it("declares A the winner when A wins more cases", () => {
    const summaryA = makeSummary("runA", 1.0, [
      { score: 1, latencyMs: 100 },
      { score: 1, latencyMs: 200 },
    ]);
    const summaryB = makeSummary("runB", 0.5, [
      { score: 0, latencyMs: 150 },
      { score: 1, latencyMs: 180 },
    ]);

    const delta = calculateDelta(summaryA, summaryB);
    expect(delta.winner).toBe("a");
    expect(delta.aWins).toBe(1);
    expect(delta.bWins).toBe(0);
    expect(delta.ties).toBe(1);
  });

  it("declares B the winner when B wins more cases", () => {
    const summaryA = makeSummary("runA", 0.5, [
      { score: 0.5, latencyMs: 100 },
      { score: 0.5, latencyMs: 200 },
    ]);
    const summaryB = makeSummary("runB", 1.0, [
      { score: 1.0, latencyMs: 80 },
      { score: 1.0, latencyMs: 90 },
    ]);

    const delta = calculateDelta(summaryA, summaryB);
    expect(delta.winner).toBe("b");
    expect(delta.bWins).toBe(2);
  });

  it("declares tie when wins are equal", () => {
    const summaryA = makeSummary("runA", 0.5, [
      { score: 1, latencyMs: 100 },
      { score: 0, latencyMs: 200 },
    ]);
    const summaryB = makeSummary("runB", 0.5, [
      { score: 0, latencyMs: 80 },
      { score: 1, latencyMs: 90 },
    ]);

    const delta = calculateDelta(summaryA, summaryB);
    expect(delta.winner).toBe("tie");
  });

  it("includes assertionBreakdown from raw results", () => {
    const summaryA = makeSummary("runA", 1, [{ score: 1, latencyMs: 100 }]);
    const summaryB = makeSummary("runB", 0.5, [{ score: 0.5, latencyMs: 100 }]);

    const rawA: RawEvalResult[] = [
      makeResult("tc1", [{ type: "contains", passed: true, score: 1, message: "ok" }]),
    ];
    const rawB: RawEvalResult[] = [
      makeResult("tc1", [{ type: "contains", passed: false, score: 0.5, message: "partial" }]),
    ];

    const delta = calculateDelta(summaryA, summaryB, rawA, rawB);
    expect(delta.assertionBreakdown).toHaveLength(1);
    expect(delta.assertionBreakdown[0]?.layer).toBe("L1");
  });

  it("returns empty assertionBreakdown when no raw results provided", () => {
    const summaryA = makeSummary("runA", 1, [{ score: 1, latencyMs: 100 }]);
    const summaryB = makeSummary("runB", 0.5, [{ score: 0.5, latencyMs: 100 }]);

    const delta = calculateDelta(summaryA, summaryB);
    expect(delta.assertionBreakdown).toEqual([]);
  });
});
