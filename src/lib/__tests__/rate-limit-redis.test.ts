import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkRateLimitAsync, checkRateLimit, stopCleanup } from "../rate-limit";

// Mock Redis
const mockEval = vi.fn();

vi.mock("../redis", () => ({
  getRedis: vi.fn(async () => {
    if (process.env.REDIS_URL) {
      return { eval: mockEval, quit: vi.fn(), status: "ready" };
    }
    return null;
  }),
  isRedisConfigured: vi.fn(() => !!process.env.REDIS_URL),
  resetRedis: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("rate-limit with Redis", () => {
  const originalRedisUrl = process.env.REDIS_URL;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalRedisUrl !== undefined) {
      process.env.REDIS_URL = originalRedisUrl;
    } else {
      delete process.env.REDIS_URL;
    }
    stopCleanup();
  });

  describe("checkRateLimitAsync — Redis available", () => {
    beforeEach(() => {
      process.env.REDIS_URL = "redis://localhost:6379";
    });

    it("returns allowed when under limit", async () => {
      mockEval.mockResolvedValue([1, 15, 0]);
      const result = await checkRateLimitAsync("test:key", 20);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(15);
      expect(result.retryAfterMs).toBe(0);
    });

    it("returns blocked when over limit", async () => {
      mockEval.mockResolvedValue([0, 0, 30000]);
      const result = await checkRateLimitAsync("test:key", 20);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfterMs).toBe(30000);
    });

    it("passes correct arguments to Redis EVAL", async () => {
      mockEval.mockResolvedValue([1, 9, 0]);
      await checkRateLimitAsync("chat:agent1:ip", 10);

      expect(mockEval).toHaveBeenCalledWith(
        expect.stringContaining("ZREMRANGEBYSCORE"),
        1,
        "ratelimit:chat:agent1:ip",
        expect.any(Number),
        60000,
        10
      );
    });

    it("uses custom maxRequests", async () => {
      mockEval.mockResolvedValue([1, 4, 0]);
      const result = await checkRateLimitAsync("test:custom", 5);
      expect(result.remaining).toBe(4);
    });
  });

  describe("checkRateLimitAsync — Redis fallback", () => {
    it("falls back to in-memory when Redis not configured", async () => {
      delete process.env.REDIS_URL;
      const result = await checkRateLimitAsync("test:fallback");
      expect(result.allowed).toBe(true);
      expect(mockEval).not.toHaveBeenCalled();
    });

    it("falls back to in-memory on Redis error", async () => {
      process.env.REDIS_URL = "redis://localhost:6379";
      mockEval.mockRejectedValue(new Error("ECONNREFUSED"));
      const result = await checkRateLimitAsync("test:error");
      expect(result.allowed).toBe(true);
    });
  });

  describe("checkRateLimit — synchronous", () => {
    it("works without Redis (in-memory only)", () => {
      delete process.env.REDIS_URL;
      const key = `sync-test-${Date.now()}`;
      const result = checkRateLimit(key);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(19);
    });

    it("blocks at limit without Redis", () => {
      delete process.env.REDIS_URL;
      const key = `sync-block-${Date.now()}`;
      for (let i = 0; i < 20; i++) {
        checkRateLimit(key);
      }
      const result = checkRateLimit(key);
      expect(result.allowed).toBe(false);
    });

    it("respects custom maxRequests", () => {
      delete process.env.REDIS_URL;
      const key = `sync-custom-${Date.now()}`;
      for (let i = 0; i < 3; i++) {
        checkRateLimit(key, 3);
      }
      const result = checkRateLimit(key, 3);
      expect(result.allowed).toBe(false);
    });
  });

  describe("configurable limits per route", () => {
    beforeEach(() => {
      process.env.REDIS_URL = "redis://localhost:6379";
    });

    it("chat route: 20 req/min default", async () => {
      mockEval.mockResolvedValue([1, 15, 0]);
      const result = await checkRateLimitAsync("chat:agent:ip");
      expect(result.allowed).toBe(true);
    });

    it("deploy route: 5 req/min", async () => {
      mockEval.mockResolvedValue([0, 0, 45000]);
      const result = await checkRateLimitAsync("deploy:user1", 5);
      expect(result.allowed).toBe(false);
    });

    it("kb upload: 10 req/min", async () => {
      mockEval.mockResolvedValue([1, 7, 0]);
      const result = await checkRateLimitAsync("kb-upload:user1", 10);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(7);
    });
  });
});
