import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkRateLimit } from "../rate-limiter";
import { stopCleanup } from "@/lib/rate-limit";

vi.mock("@/lib/redis", () => ({
  getRedis: vi.fn(async () => null),
  isRedisConfigured: vi.fn(() => false),
  resetRedis: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  stopCleanup();
});

describe("RateLimiter", () => {
  it("allows calls within limit", () => {
    for (let i = 0; i < 60; i++) {
      expect(() => checkRateLimit("user1", `agent-ok-${i}`)).not.toThrow();
    }
  });

  it("throws after exceeding 60 calls/minute", () => {
    const key = `exceed-${Date.now()}`;
    for (let i = 0; i < 60; i++) {
      checkRateLimit(key, "agent1");
    }

    expect(() => checkRateLimit(key, "agent1")).toThrow(
      /Rate limit exceeded/
    );
  });

  it("resets after sliding window expires", () => {
    const key = `expire-${Date.now()}`;
    const realDateNow = Date.now;
    let mockNow = realDateNow.call(Date);
    vi.spyOn(Date, "now").mockImplementation(() => mockNow);

    for (let i = 0; i < 60; i++) {
      checkRateLimit(key, "agent1");
    }

    expect(() => checkRateLimit(key, "agent1")).toThrow();

    mockNow += 61_000;
    expect(() => checkRateLimit(key, "agent1")).not.toThrow();

    vi.restoreAllMocks();
  });

  it("tracks different user-agent pairs independently", () => {
    const suffix = Date.now();
    for (let i = 0; i < 60; i++) {
      checkRateLimit(`user1-${suffix}`, "agent1");
    }

    expect(() => checkRateLimit(`user1-${suffix}`, "agent1")).toThrow();
    expect(() => checkRateLimit(`user2-${suffix}`, "agent1")).not.toThrow();
    expect(() => checkRateLimit(`user1-${suffix}`, "agent2")).not.toThrow();
  });
});
