import { describe, it, expect, vi, beforeEach } from "vitest";
import { evaluateAllAssertions } from "../assertions";
import { parseAssertionsForTest } from "../runner";

// ─── parseAssertions helper (test-exported) ───────────────────────────────────
// runner.ts exports parseAssertionsForTest for unit testing purposes

describe("parseAssertionsForTest", () => {
  it("parses valid assertion array", () => {
    const raw = [
      { type: "contains", value: "Paris" },
      { type: "latency", threshold: 500 },
    ];
    const result = parseAssertionsForTest(raw);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("contains");
    expect(result[1].type).toBe("latency");
  });

  it("skips invalid assertion objects", () => {
    const raw = [
      { type: "contains", value: "Paris" },
      { type: "invalid_type_xyz", value: "foo" }, // unknown type — skipped
      null,
      42,
    ];
    const result = parseAssertionsForTest(raw);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("contains");
  });

  it("returns empty array for non-array input", () => {
    expect(parseAssertionsForTest(null)).toEqual([]);
    expect(parseAssertionsForTest(undefined)).toEqual([]);
    expect(parseAssertionsForTest("string")).toEqual([]);
    expect(parseAssertionsForTest(42)).toEqual([]);
  });

  it("returns empty array for empty input array", () => {
    expect(parseAssertionsForTest([])).toEqual([]);
  });
});

// ─── Score calculation helpers ────────────────────────────────────────────────

describe("score calculation via evaluateAllAssertions", () => {
  it("score is 1.0 when all assertions pass", async () => {
    const { score } = await evaluateAllAssertions(
      [
        { type: "contains", value: "Paris" },
        { type: "not_contains", value: "sorry" },
      ],
      { input: "capital?", output: "The capital is Paris.", latencyMs: 100 },
    );
    expect(score).toBe(1);
  });

  it("score is 0.0 when all assertions fail", async () => {
    const { score } = await evaluateAllAssertions(
      [
        { type: "contains", value: "London" },
        { type: "exact_match", value: "wrong" },
      ],
      { input: "capital?", output: "The capital is Paris.", latencyMs: 100 },
    );
    expect(score).toBe(0);
  });

  it("score is 0.5 with one pass and one fail", async () => {
    const { score } = await evaluateAllAssertions(
      [
        { type: "contains", value: "Paris" },  // pass → 1
        { type: "contains", value: "London" }, // fail → 0
      ],
      { input: "capital?", output: "Paris is the capital.", latencyMs: 100 },
    );
    expect(score).toBeCloseTo(0.5);
  });

  it("passes is false if any single assertion fails", async () => {
    const { passed } = await evaluateAllAssertions(
      [
        { type: "contains", value: "Paris" },
        { type: "contains", value: "London" },
        { type: "not_contains", value: "error" },
      ],
      { input: "capital?", output: "Paris is the answer.", latencyMs: 100 },
    );
    expect(passed).toBe(false);
  });
});

// ─── Assertion result structure ────────────────────────────────────────────────

describe("AssertionResult structure", () => {
  it("contains required fields", async () => {
    const ctx = {
      input: "hello",
      output: "world",
      latencyMs: 50,
    };
    const { results } = await evaluateAllAssertions(
      [{ type: "contains", value: "world" }],
      ctx,
    );
    const r = results[0];
    expect(r).toHaveProperty("type");
    expect(r).toHaveProperty("passed");
    expect(r).toHaveProperty("score");
    expect(r).toHaveProperty("message");
    expect(typeof r.type).toBe("string");
    expect(typeof r.passed).toBe("boolean");
    expect(typeof r.score).toBe("number");
    expect(typeof r.message).toBe("string");
  });

  it("score is always between 0 and 1", async () => {
    const assertions = [
      { type: "exact_match" as const, value: "x" },
      { type: "contains" as const, value: "y" },
      { type: "latency" as const, threshold: 10 },
    ];
    const ctx = { input: "q", output: "hello world", latencyMs: 999 };
    const { results } = await evaluateAllAssertions(assertions, ctx);
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("handles empty output string", async () => {
    const { results } = await evaluateAllAssertions(
      [{ type: "contains", value: "Paris" }],
      { input: "q", output: "", latencyMs: 100 },
    );
    expect(results[0].passed).toBe(false);
  });

  it("handles very long output (truncated message)", async () => {
    const longOutput = "A".repeat(5000);
    const { results } = await evaluateAllAssertions(
      [{ type: "exact_match", value: "Paris" }],
      { input: "q", output: longOutput, latencyMs: 100 },
    );
    // Message should not be excessively long
    expect(results[0].message.length).toBeLessThan(500);
    expect(results[0].passed).toBe(false);
  });

  it("handles special regex characters in contains", async () => {
    // contains is not regex — dots should be treated literally
    const { results } = await evaluateAllAssertions(
      [{ type: "contains", value: "3.14" }],
      { input: "pi?", output: "Pi is approximately 3.14159", latencyMs: 50 },
    );
    expect(results[0].passed).toBe(true);
  });

  it("json_valid passes for nested JSON", async () => {
    const json = JSON.stringify({ user: { name: "Alice", scores: [1, 2, 3] } });
    const { results } = await evaluateAllAssertions(
      [{ type: "json_valid" }],
      { input: "q", output: json, latencyMs: 50 },
    );
    expect(results[0].passed).toBe(true);
  });

  it("latency threshold of 0 fails any non-zero latency", async () => {
    const { results } = await evaluateAllAssertions(
      [{ type: "latency", threshold: 0 }],
      { input: "q", output: "hello", latencyMs: 1 },
    );
    expect(results[0].passed).toBe(false);
  });
});
