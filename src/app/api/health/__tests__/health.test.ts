import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
    skill: { count: vi.fn().mockResolvedValue(60) },
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 29, retryAfterMs: 0 }),
}));
vi.mock("@/lib/ecc", () => ({
  isECCEnabled: vi.fn(() => false),
}));
vi.mock("@/lib/redis", () => ({
  getRedis: vi.fn(async () => null),
  isRedisConfigured: vi.fn(() => false),
}));

import { GET } from "../route";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { isECCEnabled } from "@/lib/ecc";

const mockQueryRaw = vi.mocked(prisma.$queryRaw);
const mockCheckRateLimit = vi.mocked(checkRateLimit);

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/health");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 29, retryAfterMs: 0 });
});

describe("GET /api/health", () => {
  it("returns healthy when DB is reachable", async () => {
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("healthy");
    expect(body.db).toBe("ok");
    expect(body.timestamp).toBeDefined();
  });

  it("returns degraded when DB is unreachable", async () => {
    mockQueryRaw.mockRejectedValue(new Error("connection refused"));

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.db).toBe("fail");
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: false, remaining: 0, retryAfterMs: 5000 });

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toBe("Too many requests");
  });

  it("rate limits by IP with limit of 30", async () => {
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);

    await GET(makeRequest());

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.stringContaining("health:"),
      30
    );
  });

  it("includes ECC status when disabled", async () => {
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
    vi.mocked(isECCEnabled).mockReturnValue(false);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.ecc).toBeDefined();
    expect(body.ecc.enabled).toBe(false);
    expect(body.ecc.skills).toBe(0);
  });

  it("includes ECC status with skill count when enabled", async () => {
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
    vi.mocked(isECCEnabled).mockReturnValue(true);
    vi.mocked(prisma.skill.count).mockResolvedValue(60);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.ecc.enabled).toBe(true);
    expect(body.ecc.skills).toBe(60);
  });

  it("reports ECC MCP status", async () => {
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
    vi.mocked(isECCEnabled).mockReturnValue(true);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.ecc.mcp).toBeDefined();
  });

  it("includes replicaId in response", async () => {
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.replicaId).toBeDefined();
    expect(typeof body.replicaId).toBe("string");
    expect(body.replicaId.length).toBe(8);
  });

  it("returns same replicaId across requests (stable per process)", async () => {
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const r1 = await GET(makeRequest());
    const r2 = await GET(makeRequest());

    const b1 = await r1.json();
    const b2 = await r2.json();

    expect(b1.replicaId).toBe(b2.replicaId);
  });

  it("reports redis as not-configured when REDIS_URL not set", async () => {
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.redis).toBe("not-configured");
  });
});
