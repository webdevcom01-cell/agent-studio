import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockGet = vi.fn();
const mockSetex = vi.fn();
const mockDel = vi.fn();
const mockEval = vi.fn();

vi.mock("ioredis", () => ({
  default: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    get: mockGet,
    set: vi.fn(),
    setex: mockSetex,
    del: mockDel,
    eval: mockEval,
    keys: vi.fn().mockResolvedValue([]),
    quit: vi.fn().mockResolvedValue(undefined),
    status: "ready",
  })),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  cacheGet,
  cacheSet,
  cacheDel,
  cacheSession,
  getCachedSession,
  invalidateSession,
  registerMCPConnection,
  getMCPConnection,
  removeMCPConnection,
  resetRedis,
  isRedisConfigured,
} from "../redis";

beforeEach(() => {
  vi.clearAllMocks();
  resetRedis();
  process.env.REDIS_URL = "redis://localhost:6379";
});

afterEach(() => {
  delete process.env.REDIS_URL;
  resetRedis();
});

describe("generic cache", () => {
  it("cacheGet returns cached value", async () => {
    mockGet.mockResolvedValueOnce("cached-value");
    const value = await cacheGet("test-key");
    expect(value).toBe("cached-value");
    expect(mockGet).toHaveBeenCalledWith("cache:test-key");
  });

  it("cacheGet returns null on miss", async () => {
    mockGet.mockResolvedValueOnce(null);
    expect(await cacheGet("missing")).toBeNull();
  });

  it("cacheSet stores with TTL", async () => {
    mockSetex.mockResolvedValueOnce("OK");
    await cacheSet("key", "value", 60);
    expect(mockSetex).toHaveBeenCalledWith("cache:key", 60, "value");
  });

  it("cacheDel removes key", async () => {
    mockDel.mockResolvedValueOnce(1);
    await cacheDel("key");
    expect(mockDel).toHaveBeenCalledWith("cache:key");
  });

  it("cacheGet returns null when Redis unavailable", async () => {
    delete process.env.REDIS_URL;
    resetRedis();
    expect(await cacheGet("key")).toBeNull();
  });

  it("cacheSet is no-op when Redis unavailable", async () => {
    delete process.env.REDIS_URL;
    resetRedis();
    await cacheSet("key", "value", 60);
    expect(mockSetex).not.toHaveBeenCalled();
  });
});

describe("session cache", () => {
  it("cacheSession stores session with 5-min TTL", async () => {
    mockSetex.mockResolvedValueOnce("OK");
    await cacheSession("user-1", JSON.stringify({ id: "user-1" }));
    expect(mockSetex).toHaveBeenCalledWith(
      "cache:session:user-1",
      300,
      expect.any(String)
    );
  });

  it("getCachedSession retrieves cached session", async () => {
    mockGet.mockResolvedValueOnce(JSON.stringify({ id: "user-1" }));
    const session = await getCachedSession("user-1");
    expect(session).toContain("user-1");
  });

  it("getCachedSession returns null on miss", async () => {
    mockGet.mockResolvedValueOnce(null);
    expect(await getCachedSession("user-2")).toBeNull();
  });

  it("invalidateSession removes from cache", async () => {
    mockDel.mockResolvedValueOnce(1);
    await invalidateSession("user-1");
    expect(mockDel).toHaveBeenCalledWith("cache:session:user-1");
  });
});

describe("MCP pool coordination", () => {
  it("registerMCPConnection stores entry with TTL", async () => {
    mockSetex.mockResolvedValueOnce("OK");
    await registerMCPConnection({
      serverId: "mcp-1",
      url: "http://localhost:8000",
      transport: "STREAMABLE_HTTP",
      connectedAt: "2026-03-20T00:00:00Z",
      lastUsedAt: "2026-03-20T00:00:00Z",
    });
    expect(mockSetex).toHaveBeenCalledWith(
      "cache:mcp-pool:mcp-1",
      600,
      expect.stringContaining("mcp-1")
    );
  });

  it("getMCPConnection retrieves and parses entry", async () => {
    const entry = {
      serverId: "mcp-1",
      url: "http://localhost:8000",
      transport: "STREAMABLE_HTTP",
      connectedAt: "2026-03-20T00:00:00Z",
      lastUsedAt: "2026-03-20T00:00:00Z",
    };
    mockGet.mockResolvedValueOnce(JSON.stringify(entry));

    const result = await getMCPConnection("mcp-1");
    expect(result?.serverId).toBe("mcp-1");
    expect(result?.url).toBe("http://localhost:8000");
  });

  it("getMCPConnection returns null on miss", async () => {
    mockGet.mockResolvedValueOnce(null);
    expect(await getMCPConnection("missing")).toBeNull();
  });

  it("getMCPConnection returns null on invalid JSON", async () => {
    mockGet.mockResolvedValueOnce("not-json");
    expect(await getMCPConnection("bad")).toBeNull();
  });

  it("removeMCPConnection deletes entry", async () => {
    mockDel.mockResolvedValueOnce(1);
    await removeMCPConnection("mcp-1");
    expect(mockDel).toHaveBeenCalledWith("cache:mcp-pool:mcp-1");
  });
});

describe("isRedisConfigured", () => {
  it("returns true when REDIS_URL is set", () => {
    expect(isRedisConfigured()).toBe(true);
  });

  it("returns false when REDIS_URL is not set", () => {
    delete process.env.REDIS_URL;
    resetRedis();
    expect(isRedisConfigured()).toBe(false);
  });
});

// ── Redis unavailable (null) edge cases ─────────────────────────────────
// These verify every public function degrades gracefully when Redis = null.
// Each test deletes REDIS_URL and resets inline (same pattern as existing tests above).

describe("null-Redis degradation for remaining helpers", () => {
  it("cacheDel is no-op when Redis unavailable", async () => {
    delete process.env.REDIS_URL;
    resetRedis();
    await cacheDel("key");
    expect(mockDel).not.toHaveBeenCalled();
  });

  it("cacheSession is no-op when Redis unavailable", async () => {
    delete process.env.REDIS_URL;
    resetRedis();
    await cacheSession("user-1", '{"id":"user-1"}');
    expect(mockSetex).not.toHaveBeenCalled();
  });

  it("getCachedSession returns null when Redis unavailable", async () => {
    delete process.env.REDIS_URL;
    resetRedis();
    expect(await getCachedSession("user-1")).toBeNull();
  });

  it("invalidateSession is no-op when Redis unavailable", async () => {
    delete process.env.REDIS_URL;
    resetRedis();
    await invalidateSession("user-1");
    expect(mockDel).not.toHaveBeenCalled();
  });

  it("registerMCPConnection is no-op when Redis unavailable", async () => {
    delete process.env.REDIS_URL;
    resetRedis();
    await registerMCPConnection({
      serverId: "mcp-1",
      url: "http://localhost:8000",
      transport: "STREAMABLE_HTTP",
      connectedAt: "2026-03-20T00:00:00Z",
      lastUsedAt: "2026-03-20T00:00:00Z",
    });
    expect(mockSetex).not.toHaveBeenCalled();
  });

  it("getMCPConnection returns null when Redis unavailable", async () => {
    delete process.env.REDIS_URL;
    resetRedis();
    expect(await getMCPConnection("mcp-1")).toBeNull();
  });

  it("removeMCPConnection is no-op when Redis unavailable", async () => {
    delete process.env.REDIS_URL;
    resetRedis();
    await removeMCPConnection("mcp-1");
    expect(mockDel).not.toHaveBeenCalled();
  });
});
