import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { evaluateAllAssertions } from "../assertions";
import {
  parseAssertionsForTest,
  EVAL_CHAT_TIMEOUT_MS,
  EVAL_ASSERTION_TIMEOUT_MS,
  EVAL_MAX_RETRIES,
  callAgentChatForTest,
  evaluateAssertionsWithTimeoutForTest,
} from "../runner";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

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

// ─── Timeout / retry constants ────────────────────────────────────────────────

describe("eval timeout/retry constants", () => {
  it("EVAL_CHAT_TIMEOUT_MS is 45 seconds", () => {
    expect(EVAL_CHAT_TIMEOUT_MS).toBe(45_000);
  });

  it("EVAL_ASSERTION_TIMEOUT_MS is 15 seconds", () => {
    expect(EVAL_ASSERTION_TIMEOUT_MS).toBe(15_000);
  });

  it("EVAL_MAX_RETRIES is 3", () => {
    expect(EVAL_MAX_RETRIES).toBe(3);
  });
});

// ─── callAgentChat — timeout + retry ──────────────────────────────────────────

describe("callAgentChatForTest — retry behavior", () => {
  const makeFetch = () => vi.fn();

  const makeOkResponse = (output: string) => ({
    ok: true,
    json: async () => ({
      success: true,
      data: { messages: [{ role: "assistant", content: output }] },
    }),
  });

  const makeErrorResponse = (status: number) => ({
    ok: false,
    status,
    text: async () => `error ${status}`,
  });

  it("returns output on first successful attempt", async () => {
    const mockFetch = makeFetch();
    mockFetch.mockResolvedValueOnce(makeOkResponse("Hello world"));
    vi.stubGlobal("fetch", mockFetch);

    const result = await callAgentChatForTest("agent1", "hi", "http://localhost:3000");
    expect(result.output).toBe("Hello world");
    expect(result.retryCount).toBe(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it("does NOT retry on 400 (client error) — throws immediately", async () => {
    const mockFetch = makeFetch();
    mockFetch.mockResolvedValue(makeErrorResponse(400));
    vi.stubGlobal("fetch", mockFetch);

    await expect(
      callAgentChatForTest("agent1", "hi", "http://localhost:3000"),
    ).rejects.toThrow("400");
    // Must only call fetch once — no retry on 4xx
    expect(mockFetch).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it("retries on 503 and succeeds on second attempt (fake timers skip backoff)", async () => {
    vi.useFakeTimers();
    const mockFetch = makeFetch();
    mockFetch
      .mockResolvedValueOnce(makeErrorResponse(503))
      .mockResolvedValueOnce(makeOkResponse("Recovered"));
    vi.stubGlobal("fetch", mockFetch);

    const promise = callAgentChatForTest("agent1", "hi", "http://localhost:3000");
    // Skip backoff delays
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.output).toBe("Recovered");
    expect(result.retryCount).toBe(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("throws after exhausting all retries on persistent 503 (fake timers skip backoff)", async () => {
    vi.useFakeTimers();
    const mockFetch = makeFetch();
    mockFetch.mockResolvedValue(makeErrorResponse(503));
    vi.stubGlobal("fetch", mockFetch);

    // Attach .rejects handler BEFORE advancing timers to avoid unhandled rejection warning
    const rejection = expect(
      callAgentChatForTest("agent1", "hi", "http://localhost:3000"),
    ).rejects.toThrow(/failed after/i);

    await vi.runAllTimersAsync();
    await rejection;

    // Initial attempt + EVAL_MAX_RETRIES retries = EVAL_MAX_RETRIES + 1 total
    expect(mockFetch).toHaveBeenCalledTimes(EVAL_MAX_RETRIES + 1);

    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("throws on AbortError (timeout) without retrying", async () => {
    const mockFetch = makeFetch();
    mockFetch.mockRejectedValueOnce(Object.assign(new Error("aborted"), { name: "AbortError" }));
    vi.stubGlobal("fetch", mockFetch);

    await expect(
      callAgentChatForTest("agent1", "hi", "http://localhost:3000"),
    ).rejects.toThrow(/timed out/i);
    // AbortError should not trigger retries
    expect(mockFetch).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });
});

// ─── evaluateAllAssertionsWithTimeout — L1 pass-through ───────────────────────

describe("evaluateAssertionsWithTimeoutForTest — L1 fast assertions", () => {
  it("L1-only assertions complete and return correct results", async () => {
    const result = await evaluateAssertionsWithTimeoutForTest(
      [
        { type: "contains", value: "Paris" },
        { type: "not_contains", value: "London" },
      ],
      { input: "capital?", output: "Paris is the capital.", latencyMs: 50 },
    );
    expect(result.score).toBe(1);
    expect(result.passed).toBe(true);
    expect(result.results).toHaveLength(2);
  });

  it("mixed L1 pass + L1 fail gives correct score", async () => {
    const result = await evaluateAssertionsWithTimeoutForTest(
      [
        { type: "contains", value: "Paris" },   // passes → score 1
        { type: "contains", value: "London" },  // fails → score 0
      ],
      { input: "capital?", output: "Paris is the capital.", latencyMs: 50 },
    );
    expect(result.score).toBeCloseTo(0.5);
    expect(result.passed).toBe(false);
    expect(result.results).toHaveLength(2);
  });
});
