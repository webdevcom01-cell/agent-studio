import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkRateLimit, resetRateLimits } from "../rate-limiter";

beforeEach(() => {
  resetRateLimits();
});

describe("RateLimiter", () => {
  it("allows calls within limit", () => {
    for (let i = 0; i < 60; i++) {
      expect(() => checkRateLimit("user1", "agent1")).not.toThrow();
    }
  });

  it("throws after exceeding 60 calls/minute", () => {
    for (let i = 0; i < 60; i++) {
      checkRateLimit("user1", "agent1");
    }

    expect(() => checkRateLimit("user1", "agent1")).toThrow(
      /Rate limit exceeded/
    );
  });

  it("resets after sliding window expires", () => {
    for (let i = 0; i < 60; i++) {
      checkRateLimit("user1", "agent1");
    }

    expect(() => checkRateLimit("user1", "agent1")).toThrow();

    vi.useFakeTimers();
    vi.advanceTimersByTime(61_000);

    expect(() => checkRateLimit("user1", "agent1")).not.toThrow();

    vi.useRealTimers();
  });

  it("tracks different user-agent pairs independently", () => {
    for (let i = 0; i < 60; i++) {
      checkRateLimit("user1", "agent1");
    }

    expect(() => checkRateLimit("user1", "agent1")).toThrow();
    expect(() => checkRateLimit("user2", "agent1")).not.toThrow();
    expect(() => checkRateLimit("user1", "agent2")).not.toThrow();
  });
});
