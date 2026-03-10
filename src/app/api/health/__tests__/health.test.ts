import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 29, retryAfterMs: 0 }),
}));

import { GET } from "../route";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

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
});
