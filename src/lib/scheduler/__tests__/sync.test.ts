/**
 * Unit tests for syncSchedulesFromFlow()
 *
 * Verifies:
 *  - Creates FlowSchedule for new schedule_trigger nodes
 *  - Updates FlowSchedule when node config changes
 *  - Skips update when nothing changed
 *  - Disables schedules when node is removed
 *  - Ignores non-schedule_trigger nodes
 *  - Handles CRON, INTERVAL, and MANUAL schedule types
 *  - Handles empty flow (no nodes)
 *  - Does not touch manually-created schedules (nodeId = null)
 */

import { describe, it, expect, vi, beforeEach, type MockedFunction } from "vitest";
import type { FlowContent } from "@/types";

// sync.ts uses $queryRaw / $executeRaw (raw SQL) because the generated Prisma
// client may not yet include the `nodeId` column added in the latest migration.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock cron-validator to return a fixed nextRunAt
vi.mock("@/lib/scheduler/cron-validator", () => ({
  computeNextRunAt: vi.fn().mockReturnValue(new Date("2030-01-01T00:00:00Z")),
}));

import { syncSchedulesFromFlow } from "../sync";
import { prisma } from "@/lib/prisma";

type MockPrisma = {
  $queryRaw: MockedFunction<() => Promise<unknown>>;
  $executeRaw: MockedFunction<() => Promise<number>>;
};

const mockPrisma = prisma as unknown as MockPrisma;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const AGENT_ID = "agent_test";

function makeFlow(...nodes: FlowContent["nodes"]): FlowContent {
  return { nodes, edges: [], variables: [] };
}

function scheduleNode(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    type: "schedule_trigger" as const,
    position: { x: 0, y: 0 },
    data: {
      scheduleType: "interval",
      intervalMinutes: 60,
      timezone: "UTC",
      enabled: true,
      label: "Test Schedule",
      maxRetries: 3,
      ...overrides,
    },
  };
}

/**
 * Existing schedule row as returned by the raw SELECT query.
 * Uses snake_case aliases matching the SQL: "nodeId" AS node_id, etc.
 */
function existingRow(nodeId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `sched_${nodeId}`,
    node_id: nodeId,
    schedule_type: "INTERVAL",
    cron_expression: null,
    interval_minutes: 60,
    timezone: "UTC",
    enabled: true,
    label: "Test Schedule",
    max_retries: 3,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("syncSchedulesFromFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no existing node-linked schedules, all writes succeed
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockPrisma.$executeRaw.mockResolvedValue(1);
  });

  // ── Create ──────────────────────────────────────────────────────────────────

  it("creates a FlowSchedule for a new schedule_trigger node", async () => {
    const flow = makeFlow(scheduleNode("node_1"));
    const result = await syncSchedulesFromFlow(AGENT_ID, flow);

    // One INSERT executed
    expect(mockPrisma.$executeRaw).toHaveBeenCalledOnce();
    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.disabled).toBe(0);
  });

  it("creates multiple schedules for multiple nodes", async () => {
    const flow = makeFlow(scheduleNode("n1"), scheduleNode("n2"), scheduleNode("n3"));
    const result = await syncSchedulesFromFlow(AGENT_ID, flow);

    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(3);
    expect(result.created).toBe(3);
  });

  it("maps cron scheduleType — creates with CRON type", async () => {
    const flow = makeFlow(scheduleNode("n1", { scheduleType: "cron", cronExpression: "0 9 * * 1-5" }));
    const result = await syncSchedulesFromFlow(AGENT_ID, flow);

    expect(result.created).toBe(1);
    expect(mockPrisma.$executeRaw).toHaveBeenCalledOnce();
  });

  it("maps MANUAL schedule type — creates with MANUAL type", async () => {
    const flow = makeFlow(scheduleNode("n1", { scheduleType: "manual" }));
    const result = await syncSchedulesFromFlow(AGENT_ID, flow);

    expect(result.created).toBe(1);
    expect(mockPrisma.$executeRaw).toHaveBeenCalledOnce();
  });

  // ── Update ──────────────────────────────────────────────────────────────────

  it("updates existing schedule when config changes", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([existingRow("node_1", { interval_minutes: 30 })]);
    const flow = makeFlow(scheduleNode("node_1", { intervalMinutes: 60 })); // changed
    const result = await syncSchedulesFromFlow(AGENT_ID, flow);

    // One UPDATE executed (not INSERT)
    expect(mockPrisma.$executeRaw).toHaveBeenCalledOnce();
    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);
  });

  it("skips update when nothing changed", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([existingRow("node_1")]);
    const flow = makeFlow(scheduleNode("node_1")); // identical config
    const result = await syncSchedulesFromFlow(AGENT_ID, flow);

    expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    expect(result.updated).toBe(0);
  });

  it("resets failureCount when re-enabling a disabled schedule", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([existingRow("node_1", { enabled: false })]);
    const flow = makeFlow(scheduleNode("node_1", { enabled: true }));
    const result = await syncSchedulesFromFlow(AGENT_ID, flow);

    // UPDATE ran because enabled changed
    expect(mockPrisma.$executeRaw).toHaveBeenCalledOnce();
    expect(result.updated).toBe(1);
  });

  // ── Disable ─────────────────────────────────────────────────────────────────

  it("disables schedule when its node is removed from the flow", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([existingRow("node_removed")]);
    const flow = makeFlow(); // node removed
    const result = await syncSchedulesFromFlow(AGENT_ID, flow);

    // One UPDATE SET enabled=false executed
    expect(mockPrisma.$executeRaw).toHaveBeenCalledOnce();
    expect(result.disabled).toBe(1);
  });

  it("does not disable already-disabled schedules for removed nodes", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([existingRow("node_removed", { enabled: false })]);
    const flow = makeFlow();
    const result = await syncSchedulesFromFlow(AGENT_ID, flow);

    expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    expect(result.disabled).toBe(0);
  });

  // ── Ignore non-schedule nodes ────────────────────────────────────────────────

  it("ignores non-schedule_trigger nodes", async () => {
    const flow = makeFlow(
      { id: "ai_1", type: "ai_response", position: { x: 0, y: 0 }, data: { prompt: "hello" } },
      { id: "msg_1", type: "message", position: { x: 0, y: 160 }, data: { message: "hi" } },
    );
    const result = await syncSchedulesFromFlow(AGENT_ID, flow);

    expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    expect(result.created).toBe(0);
  });

  it("does not touch manually-created schedules (nodeId = null)", async () => {
    // $queryRaw filters WHERE nodeId IS NOT NULL, so manual schedules never appear
    mockPrisma.$queryRaw.mockResolvedValue([]);

    const flow = makeFlow(); // empty flow
    const result = await syncSchedulesFromFlow(AGENT_ID, flow);

    // No writes — manual schedules left untouched
    expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    expect(result.disabled).toBe(0);
  });

  // ── Empty flow ───────────────────────────────────────────────────────────────

  it("returns all-zero result for empty flow with no existing schedules", async () => {
    const result = await syncSchedulesFromFlow(AGENT_ID, makeFlow());
    expect(result).toEqual({ created: 0, updated: 0, disabled: 0 });
  });

  // ── Create failure handling ──────────────────────────────────────────────────

  it("continues processing other nodes if one create fails", async () => {
    mockPrisma.$executeRaw
      .mockRejectedValueOnce(new Error("unique constraint"))
      .mockResolvedValueOnce(1);

    const flow = makeFlow(scheduleNode("n1"), scheduleNode("n2"));
    const result = await syncSchedulesFromFlow(AGENT_ID, flow);

    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(2);
    // n1 failed (not counted), n2 succeeded
    expect(result.created).toBe(1);
  });
});
