import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkRateLimit } from "../rate-limit";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("checkRateLimit", () => {
  it("allows requests under the limit", () => {
    const key = `test-allow-${Date.now()}`;
    const result = checkRateLimit(key);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(19);
    expect(result.retryAfterMs).toBe(0);
  });

  it("tracks remaining count correctly", () => {
    const key = `test-remaining-${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      checkRateLimit(key);
    }
    const result = checkRateLimit(key);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(14);
  });

  it("blocks when limit is exceeded", () => {
    const key = `test-block-${Date.now()}`;
    for (let i = 0; i < 20; i++) {
      checkRateLimit(key);
    }
    const result = checkRateLimit(key);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("isolates different keys", () => {
    const keyA = `test-a-${Date.now()}`;
    const keyB = `test-b-${Date.now()}`;
    for (let i = 0; i < 20; i++) {
      checkRateLimit(keyA);
    }
    const resultA = checkRateLimit(keyA);
    const resultB = checkRateLimit(keyB);
    expect(resultA.allowed).toBe(false);
    expect(resultB.allowed).toBe(true);
  });

  it("allows requests after window expires", () => {
    const key = `test-expire-${Date.now()}`;
    const realDateNow = Date.now;

    let mockNow = realDateNow.call(Date);
    vi.spyOn(Date, "now").mockImplementation(() => mockNow);

    for (let i = 0; i < 20; i++) {
      checkRateLimit(key);
    }
    expect(checkRateLimit(key).allowed).toBe(false);

    mockNow += 61_000;
    const result = checkRateLimit(key);
    expect(result.allowed).toBe(true);

    vi.restoreAllMocks();
  });
});
