/**
 * Unit tests for GET /api/agents/[agentId]/schedules/stats
 *
 * Strategy:
 *   - requireAgentOwner is mocked so auth logic isn't re-tested here
 *   - prisma queries are mocked to control schedule + execution data
 *   - Tests verify correct aggregation (successRate, circuitBroken, nextDueAt, etc.)
 */

import { describe, it, expect, vi, beforeEach, type MockedFunction } from "vitest";

// ─── Mock dependencies ────────────────────────────────────────────────────────

vi.mock("@/lib/api/auth-guard", () => ({
  requireAgentOwner: vi.fn().mockResolvedValue({ userId: "user_001", agentId: "agent_001" }),
  isAuthError: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    flowSchedule: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    scheduledExecution: {
      aggregate: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { NextRequest } from "next/server";
import { GET } from "../stats/route";
import { prisma } from "@/lib/prisma";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type MockPrisma = {
  flowSchedule: {
    findMany: MockedFunction<typeof prisma.flowSchedule.findMany>;
    findFirst: MockedFunction<typeof prisma.flowSchedule.findFirst>;
  };
  scheduledExecution: {
    aggregate: MockedFunction<typeof prisma.scheduledExecution.aggregate>;
    count: MockedFunction<typeof prisma.scheduledExecution.count>;
  };
};

const mockPrisma = prisma as unknown as MockPrisma;
const mockRequireAgentOwner = requireAgentOwner as MockedFunction<typeof requireAgentOwner>;
const mockIsAuthError = isAuthError as MockedFunction<typeof isAuthError>;

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/agents/agent_001/schedules/stats");
}

function makeParams(agentId = "agent_001") {
  return { params: Promise.resolve({ agentId }) };
}

const FUTURE_DATE = new Date("2030-01-01T10:00:00Z");

// ─── Default happy-path schedule rows ────────────────────────────────────────

const enabledSchedule = {
  id: "sched_001",
  enabled: true,
  failureCount: 0,
  maxRetries: 3,
};

const disabledSchedule = {
  id: "sched_002",
  enabled: false,
  failureCount: 1,
  maxRetries: 3,
};

const circuitBrokenSchedule = {
  id: "sched_003",
  enabled: false,
  failureCount: 3,
  maxRetries: 3,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/agents/[agentId]/schedules/stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockRequireAgentOwner.mockResolvedValue({ userId: "user_001", agentId: "agent_001" });
    mockIsAuthError.mockReturnValue(false);

    // Default: 3 schedules (1 enabled, 1 disabled, 1 circuit-broken)
    mockPrisma.flowSchedule.findMany.mockResolvedValue(
      [enabledSchedule, disabledSchedule, circuitBrokenSchedule] as never,
    );

    mockPrisma.scheduledExecution.aggregate.mockResolvedValue({
      _count: { id: 10 },
      _avg: { durationMs: 1500 },
    } as never);

    mockPrisma.flowSchedule.findFirst.mockResolvedValue({
      nextRunAt: FUTURE_DATE,
    } as never);

    // completedCount = 8, terminalCount = 10
    mockPrisma.scheduledExecution.count
      .mockResolvedValueOnce(8)   // COMPLETED
      .mockResolvedValueOnce(10); // COMPLETED + FAILED
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  it("returns 200 with correct counts", async () => {
    const res = await GET(makeRequest(), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.total).toBe(3);
    expect(body.data.enabled).toBe(1);
    expect(body.data.disabled).toBe(2);
  });

  it("identifies circuit-broken schedules correctly", async () => {
    const res = await GET(makeRequest(), makeParams());
    const body = await res.json();
    // sched_003 has failureCount (3) >= maxRetries (3) and is disabled
    expect(body.data.circuitBroken).toBe(1);
  });

  it("computes successRate from completed / terminal executions", async () => {
    const res = await GET(makeRequest(), makeParams());
    const body = await res.json();
    // 8 completed / 10 terminal = 0.8
    expect(body.data.successRate).toBeCloseTo(0.8);
  });

  it("rounds avgDurationMs", async () => {
    const res = await GET(makeRequest(), makeParams());
    const body = await res.json();
    expect(body.data.avgDurationMs).toBe(1500);
  });

  it("returns totalExecutions from aggregate count", async () => {
    const res = await GET(makeRequest(), makeParams());
    const body = await res.json();
    expect(body.data.totalExecutions).toBe(10);
  });

  it("returns nextDueAt from earliest enabled schedule", async () => {
    const res = await GET(makeRequest(), makeParams());
    const body = await res.json();
    expect(body.data.nextDueAt).toBe(FUTURE_DATE.toISOString());
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  it("returns successRate null when no terminal executions", async () => {
    mockPrisma.scheduledExecution.count
      .mockReset()
      .mockResolvedValueOnce(0)  // COMPLETED
      .mockResolvedValueOnce(0); // terminal

    const res = await GET(makeRequest(), makeParams());
    const body = await res.json();
    expect(body.data.successRate).toBeNull();
  });

  it("returns avgDurationMs null when no executions", async () => {
    mockPrisma.scheduledExecution.aggregate.mockResolvedValue({
      _count: { id: 0 },
      _avg: { durationMs: null },
    } as never);

    const res = await GET(makeRequest(), makeParams());
    const body = await res.json();
    expect(body.data.avgDurationMs).toBeNull();
  });

  it("returns nextDueAt null when no enabled schedules", async () => {
    mockPrisma.flowSchedule.findFirst.mockResolvedValue(null as never);

    const res = await GET(makeRequest(), makeParams());
    const body = await res.json();
    expect(body.data.nextDueAt).toBeNull();
  });

  it("returns all zeros when no schedules exist", async () => {
    mockPrisma.flowSchedule.findMany.mockResolvedValue([] as never);
    mockPrisma.scheduledExecution.aggregate.mockResolvedValue({
      _count: { id: 0 },
      _avg: { durationMs: null },
    } as never);
    mockPrisma.scheduledExecution.count.mockReset().mockResolvedValue(0);
    mockPrisma.flowSchedule.findFirst.mockResolvedValue(null as never);

    const res = await GET(makeRequest(), makeParams());
    const body = await res.json();
    expect(body.data.total).toBe(0);
    expect(body.data.enabled).toBe(0);
    expect(body.data.disabled).toBe(0);
    expect(body.data.circuitBroken).toBe(0);
    expect(body.data.successRate).toBeNull();
    expect(body.data.totalExecutions).toBe(0);
    expect(body.data.nextDueAt).toBeNull();
  });

  it("does not count a disabled-but-not-circuit-broken schedule as circuitBroken", async () => {
    // disabledSchedule: failureCount=1 < maxRetries=3 → NOT circuit broken
    mockPrisma.flowSchedule.findMany.mockResolvedValue(
      [disabledSchedule] as never,
    );

    const res = await GET(makeRequest(), makeParams());
    const body = await res.json();
    expect(body.data.disabled).toBe(1);
    expect(body.data.circuitBroken).toBe(0);
  });

  // ── Auth ───────────────────────────────────────────────────────────────────

  it("returns 401 when not authenticated", async () => {
    mockIsAuthError.mockReturnValue(true);
    mockRequireAgentOwner.mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }) as never,
    );

    const res = await GET(makeRequest(), makeParams());
    expect(res.status).toBe(401);
  });

  // ── DB error ───────────────────────────────────────────────────────────────

  it("returns 500 on DB error", async () => {
    mockPrisma.flowSchedule.findMany.mockRejectedValue(new Error("DB connection lost"));

    const res = await GET(makeRequest(), makeParams());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});
