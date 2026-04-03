/**
 * Tests for:
 *   GET /api/agent-calls           (route.ts)
 *   GET /api/agent-calls/stats     (stats/route.ts)
 *
 * 6 tests total — covers auth guard, happy path, and filter params.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mockAuth = vi.hoisted(() => vi.fn());
const mockValidateApiKey = vi.hoisted(() => vi.fn());

const mockPrisma = vi.hoisted(() => ({
  agentCallLog: {
    findMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
    groupBy: vi.fn(),
  },
  $queryRaw: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api/api-key", () => ({ validateApiKey: mockValidateApiKey }));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({ get: () => null }),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Import after mocks
import { GET as getAgentCalls } from "../route";
import { GET as getAgentCallStats } from "../stats/route";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeRequest(url: string): NextRequest {
  return new NextRequest(url);
}

function stubStatsQueryRaw(): void {
  // $queryRaw is called 7 times; return sensible empty results for all
  mockPrisma.$queryRaw
    .mockResolvedValueOnce([]) // topCallerAgents
    .mockResolvedValueOnce([]) // topCalleeAgents
    .mockResolvedValueOnce([]) // recentFailures
    .mockResolvedValueOnce([]) // timeSeries
    .mockResolvedValueOnce([]) // latencyBuckets
    .mockResolvedValueOnce([]) // agentPairs
    .mockResolvedValueOnce([]) // percentiles
    .mockResolvedValue([]);    // fallback
}

// ── Tests: GET /api/agent-calls ───────────────────────────────────────────────

describe("GET /api/agent-calls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateApiKey.mockResolvedValue(null); // no api-key header
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const res = await getAgentCalls(makeRequest("http://localhost/api/agent-calls"));

    expect(res).toBeInstanceOf(NextResponse);
    expect(res.status).toBe(401);
  });

  it("returns logs scoped to the authenticated user", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-abc" } });

    const fakeLogs = [
      { id: "log-1", callerAgentId: "a1", calleeAgentId: "a2", status: "COMPLETED" },
    ];
    mockPrisma.agentCallLog.findMany.mockResolvedValue(fakeLogs);

    const res = await getAgentCalls(makeRequest("http://localhost/api/agent-calls"));
    const body = await res.json() as { success: boolean; data: unknown[] };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);

    // Verify the Prisma call scoped to the user
    expect(mockPrisma.agentCallLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          callerAgent: { userId: "user-abc" },
        }),
      }),
    );
  });

  it("applies agentId filter when provided", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-abc" } });
    mockPrisma.agentCallLog.findMany.mockResolvedValue([]);

    await getAgentCalls(
      makeRequest("http://localhost/api/agent-calls?agentId=agent-42"),
    );

    expect(mockPrisma.agentCallLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          callerAgentId: "agent-42",
        }),
      }),
    );
  });
});

// ── Tests: GET /api/agent-calls/stats ─────────────────────────────────────────

describe("GET /api/agent-calls/stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateApiKey.mockResolvedValue(null);
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const res = await getAgentCallStats(
      makeRequest("http://localhost/api/agent-calls/stats"),
    );

    expect(res.status).toBe(401);
  });

  it("returns stats payload with expected top-level keys", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-abc" } });

    mockPrisma.agentCallLog.count.mockResolvedValue(10);
    mockPrisma.agentCallLog.aggregate.mockResolvedValue({
      _avg: { durationMs: 250 },
      _sum: { tokensUsed: 500, estimatedCostUsd: 0.05 },
    });
    mockPrisma.agentCallLog.groupBy.mockResolvedValue([
      { status: "COMPLETED", _count: 8 },
      { status: "FAILED", _count: 2 },
    ]);
    stubStatsQueryRaw();

    const res = await getAgentCallStats(
      makeRequest("http://localhost/api/agent-calls/stats"),
    );
    const body = await res.json() as { success: boolean; data: Record<string, unknown> };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      totalCalls: 10,
      period: "24h",
      successRate: expect.any(Number),
      avgDurationMs: 250,
    });
  });

  it("accepts custom period parameter (7d)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-abc" } });

    mockPrisma.agentCallLog.count.mockResolvedValue(0);
    mockPrisma.agentCallLog.aggregate.mockResolvedValue({
      _avg: { durationMs: null },
      _sum: { tokensUsed: null, estimatedCostUsd: null },
    });
    mockPrisma.agentCallLog.groupBy.mockResolvedValue([]);
    stubStatsQueryRaw();

    const res = await getAgentCallStats(
      makeRequest("http://localhost/api/agent-calls/stats?period=7d"),
    );
    const body = await res.json() as { success: boolean; data: Record<string, unknown> };

    expect(res.status).toBe(200);
    expect(body.data.period).toBe("7d");
  });
});
