import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — hoisted before imports
// ---------------------------------------------------------------------------

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({ logger: mockLogger }));

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

import { withRetry } from "../ai-retry";

// ---------------------------------------------------------------------------
// Timer setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("withRetry", () => {
  it("returns result immediately when fn succeeds on first call", async () => {
    const fn = vi.fn().mockResolvedValue("ok");

    const result = await withRetry(fn);

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledOnce();
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it("retries on 429 statusCode and returns result on second call", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce({ statusCode: 429, message: "rate limited" })
      .mockResolvedValueOnce("ok");

    const promise = withRetry(fn);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(mockLogger.warn).toHaveBeenCalledOnce();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "AI call rate-limited, retrying",
      expect.objectContaining({ attempt: 0 }),
    );
  });

  it("retries on error message containing 'rate limit'", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("OpenAI rate limit exceeded"))
      .mockResolvedValueOnce("ok");

    const promise = withRetry(fn);
    await vi.runAllTimersAsync();
    await promise;

    expect(fn).toHaveBeenCalledTimes(2);
    expect(mockLogger.warn).toHaveBeenCalledOnce();
  });

  it("throws immediately for non-retryable error without logging", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Invalid API key"));

    await expect(withRetry(fn)).rejects.toThrow("Invalid API key");

    expect(fn).toHaveBeenCalledOnce();
    expect(mockLogger.warn).not.toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it("exhausts maxRetries and re-throws, logging error", async () => {
    const options = { maxRetries: 2, baseDelayMs: 100, maxDelayMs: 5000 };
    const fn = vi.fn().mockRejectedValue({ statusCode: 429, message: "rate limited" });

    const promise = withRetry(fn, options);
    // Attach rejects assertion BEFORE running timers to prevent unhandled rejection warning.
    const rejectExpectation = expect(promise).rejects.toMatchObject({ statusCode: 429 });
    await vi.runAllTimersAsync();
    await rejectExpectation;

    expect(fn).toHaveBeenCalledTimes(3);
    expect(mockLogger.warn).toHaveBeenCalledTimes(2);
    expect(mockLogger.error).toHaveBeenCalledOnce();
    expect(mockLogger.error).toHaveBeenCalledWith(
      "AI call failed after retries exhausted",
      expect.objectContaining({ attempts: 3 }),
    );
  });

  it("respects maxRetries: 0 — throws on first failure without retrying", async () => {
    const options = { maxRetries: 0 };
    const fn = vi.fn().mockRejectedValue({ statusCode: 429, message: "rate limited" });

    await expect(withRetry(fn, options)).rejects.toMatchObject({ statusCode: 429 });

    expect(fn).toHaveBeenCalledOnce();
    expect(mockLogger.warn).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledOnce();
    expect(mockLogger.error).toHaveBeenCalledWith(
      "AI call failed after retries exhausted",
      expect.objectContaining({ attempts: 1 }),
    );
  });

  it("applies exponential backoff — delay doubles each retry", async () => {
    const options = { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 30_000 };
    const fn = vi.fn().mockRejectedValue({ statusCode: 503, message: "service unavailable" });

    const promise = withRetry(fn, options);
    // Suppress unhandled rejection before advancing timers.
    const settled = promise.catch(() => undefined);
    await vi.runAllTimersAsync();
    await settled;

    const delays = mockLogger.warn.mock.calls.map(
      (c) => (c[1] as Record<string, unknown>).delayMs as number,
    );

    expect(delays[0]).toBeGreaterThanOrEqual(1000);
    expect(delays[0]).toBeLessThan(1200);

    expect(delays[1]).toBeGreaterThanOrEqual(2000);
    expect(delays[1]).toBeLessThan(2400);

    expect(delays[2]).toBeGreaterThanOrEqual(4000);
    expect(delays[2]).toBeLessThan(4800);
  });

  it("caps delay at maxDelayMs before applying jitter", async () => {
    const options = { maxRetries: 1, baseDelayMs: 20_000, maxDelayMs: 5_000 };
    const fn = vi.fn().mockRejectedValue({ statusCode: 429, message: "rate limited" });

    const promise = withRetry(fn, options);
    // Suppress unhandled rejection before advancing timers.
    const settled = promise.catch(() => undefined);
    await vi.runAllTimersAsync();
    await settled;

    const delay = (mockLogger.warn.mock.calls[0][1] as Record<string, unknown>).delayMs as number;

    expect(delay).toBeGreaterThanOrEqual(5000);
    expect(delay).toBeLessThan(6000);
  });
});
