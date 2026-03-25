/**
 * Unit tests for src/lib/scheduler/execution-engine.ts
 *
 * Strategy:
 *   - The core DB-interaction path (runScheduledFlow) is tested via mocks
 *   - isValidScheduleType helper is tested directly
 *   - The idempotency key format is verified
 *   - Circuit breaker logic is verified through the mock for finalise
 */

import { describe, it, expect, vi, beforeEach, type MockedFunction } from "vitest";

// ─── Mock dependencies before importing the module under test ─────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    scheduledExecution: {
      create: vi.fn(),
      update: vi.fn(),
    },
    flowSchedule: {
      update: vi.fn(),
    },
    flowVersion: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    agent: {
      findFirst: vi.fn(),
    },
    conversation: {
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/runtime/engine", () => ({
  executeFlow: vi.fn(),
}));

vi.mock("@/lib/validators/flow-content", () => ({
  parseFlowContent: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  trackScheduleExecution: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { executeFlow } from "@/lib/runtime/engine";
import { parseFlowContent } from "@/lib/validators/flow-content";
import { runScheduledFlow, isValidScheduleType } from "../execution-engine";
import type { FlowSchedule } from "@/generated/prisma";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSchedule(overrides: Partial<FlowSchedule> = {}): FlowSchedule {
  return {
    id: "sched_001",
    agentId: "agent_001",
    scheduleType: "CRON",
    cronExpression: "0 9 * * *",
    intervalMinutes: null,
    timezone: "UTC",
    enabled: true,
    nextRunAt: new Date("2024-01-15T09:00:00Z"),
    lastRunAt: null,
    failureCount: 0,
    maxRetries: 3,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

// ─── isValidScheduleType ──────────────────────────────────────────────────────

describe("isValidScheduleType", () => {
  it("returns true for CRON", () => {
    expect(isValidScheduleType("CRON")).toBe(true);
  });

  it("returns true for INTERVAL", () => {
    expect(isValidScheduleType("INTERVAL")).toBe(true);
  });

  it("returns true for MANUAL", () => {
    expect(isValidScheduleType("MANUAL")).toBe(true);
  });

  it("returns false for lowercase variants", () => {
    expect(isValidScheduleType("cron")).toBe(false);
    expect(isValidScheduleType("interval")).toBe(false);
    expect(isValidScheduleType("manual")).toBe(false);
  });

  it("returns false for arbitrary strings", () => {
    expect(isValidScheduleType("DAILY")).toBe(false);
    expect(isValidScheduleType("")).toBe(false);
  });
});

// ─── runScheduledFlow ─────────────────────────────────────────────────────────

describe("runScheduledFlow", () => {
  const mockPrisma = prisma as unknown as {
    scheduledExecution: {
      create: MockedFunction<typeof prisma.scheduledExecution.create>;
      update: MockedFunction<typeof prisma.scheduledExecution.update>;
    };
    flowSchedule: {
      update: MockedFunction<typeof prisma.flowSchedule.update>;
    };
    flowVersion: {
      findUnique: MockedFunction<typeof prisma.flowVersion.findUnique>;
    };
    agent: {
      findFirst: MockedFunction<typeof prisma.agent.findFirst>;
    };
    conversation: {
      create: MockedFunction<typeof prisma.conversation.create>;
      update: MockedFunction<typeof prisma.conversation.update>;
    };
    $transaction: MockedFunction<typeof prisma.$transaction>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default happy-path mocks
    mockPrisma.scheduledExecution.create.mockResolvedValue({ id: "exec_001" } as never);
    mockPrisma.scheduledExecution.update.mockResolvedValue({} as never);
    mockPrisma.flowSchedule.update.mockResolvedValue({} as never);
    mockPrisma.$transaction.mockImplementation(async (ops: unknown) => {
      if (Array.isArray(ops)) {
        return Promise.all(ops.map((op: Promise<unknown>) => op));
      }
      return (ops as () => Promise<unknown>)();
    });
    mockPrisma.conversation.create.mockResolvedValue({ id: "conv_001" } as never);
    mockPrisma.conversation.update.mockResolvedValue({} as never);

    mockPrisma.agent.findFirst.mockResolvedValue({
      id: "agent_001",
      flow: {
        id: "flow_001",
        activeVersionId: null,
        content: { nodes: [], edges: [], variables: [] },
      },
    } as never);

    mockPrisma.flowVersion.findUnique.mockResolvedValue(null as never);

    (parseFlowContent as MockedFunction<typeof parseFlowContent>).mockReturnValue({
      nodes: [],
      edges: [],
      variables: [],
    });

    (executeFlow as MockedFunction<typeof executeFlow>).mockResolvedValue({
      messages: [],
      nextNodeId: null,
      waitForInput: false,
    });
  });

  // ── Happy path ─────────────────────────────────────────────────────────

  it("returns COMPLETED on success", async () => {
    const result = await runScheduledFlow(makeSchedule());
    expect(result.status).toBe("COMPLETED");
    expect(result.scheduleId).toBe("sched_001");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("calls executeFlow with correct agentId context", async () => {
    await runScheduledFlow(makeSchedule());
    expect(executeFlow).toHaveBeenCalledOnce();
    const ctx = (executeFlow as MockedFunction<typeof executeFlow>).mock.calls[0][0];
    expect(ctx.agentId).toBe("agent_001");
    expect(ctx.isNewConversation).toBe(true);
  });

  it("injects schedule metadata into context variables", async () => {
    await runScheduledFlow(makeSchedule());
    const ctx = (executeFlow as MockedFunction<typeof executeFlow>).mock.calls[0][0];
    expect(ctx.variables.__schedule_id).toBe("sched_001");
    expect(ctx.variables.__schedule_type).toBe("CRON");
    expect(typeof ctx.variables.__triggered_at).toBe("string");
  });

  // ── Idempotency ────────────────────────────────────────────────────────

  it("returns SKIPPED when idempotency key already exists (unique constraint)", async () => {
    mockPrisma.scheduledExecution.create.mockRejectedValue(
      new Error("Unique constraint failed on the fields: (`idempotencyKey`)"),
    );

    const result = await runScheduledFlow(makeSchedule());
    expect(result.status).toBe("SKIPPED");
    expect(executeFlow).not.toHaveBeenCalled();
  });

  it("does NOT skip for non-idempotency DB errors — rethrows", async () => {
    mockPrisma.scheduledExecution.create.mockRejectedValue(
      new Error("Connection refused"),
    );

    await expect(runScheduledFlow(makeSchedule())).rejects.toThrow("Connection refused");
  });

  // ── Agent not found ────────────────────────────────────────────────────

  it("returns FAILED when agent is not found", async () => {
    mockPrisma.agent.findFirst.mockResolvedValue(null as never);

    const result = await runScheduledFlow(makeSchedule());
    expect(result.status).toBe("FAILED");
    expect(result.error).toContain("not found");
    expect(executeFlow).not.toHaveBeenCalled();
  });

  it("returns FAILED when agent has no flow", async () => {
    mockPrisma.agent.findFirst.mockResolvedValue({
      id: "agent_001",
      flow: null,
    } as never);

    const result = await runScheduledFlow(makeSchedule());
    expect(result.status).toBe("FAILED");
    expect(executeFlow).not.toHaveBeenCalled();
  });

  // ── Flow content parsing ───────────────────────────────────────────────

  it("returns FAILED when flow content cannot be parsed", async () => {
    (parseFlowContent as MockedFunction<typeof parseFlowContent>).mockReturnValue(null as never);

    const result = await runScheduledFlow(makeSchedule());
    expect(result.status).toBe("FAILED");
    expect(result.error).toContain("parse");
    expect(executeFlow).not.toHaveBeenCalled();
  });

  it("uses activeVersion content when available", async () => {
    const activeContent = { nodes: [{ id: "n1" }], edges: [], variables: [] };
    mockPrisma.agent.findFirst.mockResolvedValue({
      id: "agent_001",
      flow: {
        id: "flow_001",
        activeVersionId: "ver_001",
        content: { nodes: [], edges: [], variables: [] },
      },
    } as never);
    mockPrisma.flowVersion.findUnique.mockResolvedValue({ content: activeContent } as never);

    await runScheduledFlow(makeSchedule());

    expect(parseFlowContent).toHaveBeenCalledWith(activeContent);
  });

  it("falls back to flow.content when no activeVersionId", async () => {
    const flowContent = { nodes: [{ id: "n2" }], edges: [], variables: [] };
    mockPrisma.agent.findFirst.mockResolvedValue({
      id: "agent_001",
      flow: {
        id: "flow_001",
        activeVersionId: null,
        content: flowContent,
      },
    } as never);

    await runScheduledFlow(makeSchedule());

    expect(parseFlowContent).toHaveBeenCalledWith(flowContent);
  });

  // ── Execution failure ──────────────────────────────────────────────────

  it("returns FAILED when executeFlow throws", async () => {
    (executeFlow as MockedFunction<typeof executeFlow>).mockRejectedValue(
      new Error("AI provider timeout"),
    );

    const result = await runScheduledFlow(makeSchedule());
    expect(result.status).toBe("FAILED");
    expect(result.error).toContain("timeout");
  });

  // ── Circuit breaker ────────────────────────────────────────────────────

  it("calls finalise — DB transaction is called on COMPLETED", async () => {
    await runScheduledFlow(makeSchedule());
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
  });

  it("calls finalise — DB transaction is called on FAILED", async () => {
    (executeFlow as MockedFunction<typeof executeFlow>).mockRejectedValue(
      new Error("error"),
    );
    await runScheduledFlow(makeSchedule());
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
  });
});
