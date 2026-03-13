import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockAuth = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  conversation: { count: vi.fn() },
  message: { count: vi.fn() },
  $queryRaw: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 9, retryAfterMs: 0 }),
}));

import { GET } from "../route";
import { checkRateLimit } from "@/lib/rate-limit";

const mockCheckRateLimit = vi.mocked(checkRateLimit);

const USER_A_SESSION = { user: { id: "user-a", email: "a@test.com" } };

function makeRequest(period = "30d"): NextRequest {
  return new NextRequest(`http://localhost:3000/api/analytics?period=${period}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(USER_A_SESSION);
  mockPrisma.conversation.count.mockResolvedValue(5);
  mockPrisma.message.count.mockResolvedValue(20);
  mockPrisma.$queryRaw.mockResolvedValue([]);
});

describe("GET /api/analytics", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("scopes conversation count to current user", async () => {
    await GET(makeRequest());

    expect(mockPrisma.conversation.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          agent: { userId: "user-a" },
        }),
      }),
    );
  });

  it("scopes message count to current user", async () => {
    await GET(makeRequest());

    expect(mockPrisma.message.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          conversation: { agent: { userId: "user-a" } },
        }),
      }),
    );
  });

  it("includes userId in raw SQL queries", async () => {
    await GET(makeRequest());

    const rawCalls = mockPrisma.$queryRaw.mock.calls;
    expect(rawCalls.length).toBeGreaterThan(0);

    for (const call of rawCalls) {
      const sqlTemplate = call[0];
      const sqlStrings = sqlTemplate.strings?.join(" ") ?? String(sqlTemplate);
      const containsUserFilter =
        sqlStrings.includes('"userId"') || sqlStrings.includes("userId");
      expect(containsUserFilter).toBe(true);
    }
  });

  it("returns success with data structure", async () => {
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("summary");
    expect(body.data).toHaveProperty("timeSeries");
    expect(body.data).toHaveProperty("topAgents");
    expect(body.data).toHaveProperty("modelUsage");
    expect(body.data).toHaveProperty("costTrend");
    expect(body.data).toHaveProperty("conversationFunnel");
    expect(body.data.summary).toHaveProperty("totalCostUsd");
    expect(body.data.summary).toHaveProperty("errorRate");
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: false, remaining: 0, retryAfterMs: 5000 });

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.error).toBe("Too many requests");
  });

  it("rate limits by userId with limit of 10", async () => {
    await GET(makeRequest());

    expect(mockCheckRateLimit).toHaveBeenCalledWith("analytics:user-a", 10);
  });
});
