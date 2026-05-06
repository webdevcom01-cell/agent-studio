import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — hoisted before imports
// ---------------------------------------------------------------------------

const mockPipelineRunUpdate = vi.hoisted(() => vi.fn());
const mockPipelineRunGroupBy  = vi.hoisted(() => vi.fn());
const mockPipelineRunFindUnique = vi.hoisted(() => vi.fn());
const mockPipelineRunCount = vi.hoisted(() => vi.fn());
const mockPipelineRunFindMany = vi.hoisted(() => vi.fn());
const mockModelPerfStatFindMany = vi.hoisted(() => vi.fn());
const mockModelPerfStatUpsert = vi.hoisted(() => vi.fn());
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pipelineRun: {
      update:     mockPipelineRunUpdate,
      findUnique: mockPipelineRunFindUnique,
      count:      mockPipelineRunCount,
      findMany:   mockPipelineRunFindMany,
      groupBy:    mockPipelineRunGroupBy,
    },
    modelPerformanceStat: {
      findMany: mockModelPerfStatFindMany,
      upsert: mockModelPerfStatUpsert,
    },
  },
}));

vi.mock("@/lib/logger", () => ({ logger: mockLogger }));

import {
  recordAllStepMetrics,
  aggregateRunMetrics,
  getModelStats,
  getPipelineSummary,
  type StepMetric,
} from "../metrics-collector";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMetric(overrides: Partial<StepMetric> = {}): StepMetric {
  return {
    stepId: "codegen",
    phase: "implementation",
    modelId: "deepseek-chat",
    inputTokens: 1000,
    outputTokens: 500,
    durationMs: 3000,
    feedbackAttempts: 0,
    outcome: "success",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPipelineRunUpdate.mockResolvedValue({});
  mockPipelineRunFindUnique.mockResolvedValue(null);
  mockPipelineRunCount.mockResolvedValue(0);
  mockPipelineRunGroupBy.mockResolvedValue([]);
  mockPipelineRunFindMany.mockResolvedValue([]);
  mockModelPerfStatFindMany.mockResolvedValue([]);
  mockModelPerfStatUpsert.mockResolvedValue({});
});

// ---------------------------------------------------------------------------
// recordAllStepMetrics
// ---------------------------------------------------------------------------

describe("recordAllStepMetrics", () => {
  it("calls prisma.pipelineRun.update with merged stepMetrics data", async () => {
    // No existing metrics in DB
    mockPipelineRunFindUnique.mockResolvedValueOnce({ stepMetrics: null });
    const metrics = { 0: makeMetric({ stepId: "codegen" }) };
    await recordAllStepMetrics("run-1", metrics);

    expect(mockPipelineRunUpdate).toHaveBeenCalledOnce();
    const updateArg = mockPipelineRunUpdate.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: "run-1" });
    expect((updateArg.data.stepMetrics as Record<string, unknown>)[0]).toBeDefined();
  });

  it("merges with existing step metrics on retry (does not overwrite)", async () => {
    // Steps 0-1 already in DB from original run; step 2 is new (from retry)
    mockPipelineRunFindUnique.mockResolvedValueOnce({
      stepMetrics: {
        "0": makeMetric({ stepId: "planning",        durationMs: 1000 }),
        "1": makeMetric({ stepId: "implementation",  durationMs: 2000 }),
      },
    });
    const newMetrics = { 2: makeMetric({ stepId: "testing", durationMs: 3000 }) };
    await recordAllStepMetrics("run-retry", newMetrics);

    const updateArg = mockPipelineRunUpdate.mock.calls[0][0];
    const merged = updateArg.data.stepMetrics as Record<string, unknown>;
    // All three steps must be present after merge
    expect(Object.keys(merged)).toHaveLength(3);
    expect(merged["0"]).toBeDefined();
    expect(merged["1"]).toBeDefined();
    expect(merged["2"]).toBeDefined();
  });

  it("does not call DB when metrics is an empty object", async () => {
    await recordAllStepMetrics("run-1", {});
    expect(mockPipelineRunUpdate).not.toHaveBeenCalled();
  });

  it("logs warn but does not throw when Prisma throws", async () => {
    mockPipelineRunUpdate.mockRejectedValueOnce(new Error("DB error"));
    await expect(
      recordAllStepMetrics("run-1", { 0: makeMetric() }),
    ).resolves.toBeUndefined();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "metrics-collector: failed to persist step metrics",
      expect.objectContaining({ runId: "run-1" }),
    );
  });
});

// ---------------------------------------------------------------------------
// aggregateRunMetrics
// ---------------------------------------------------------------------------

describe("aggregateRunMetrics", () => {
  it("correctly groups by (modelId, phase) and upserts one stat per pair", async () => {
    mockPipelineRunFindUnique.mockResolvedValueOnce({
      stepMetrics: {
        "0": makeMetric({ modelId: "deepseek-chat", phase: "implementation", outcome: "success", feedbackAttempts: 0 }),
        "1": makeMetric({ stepId: "run_tests", modelId: "deepseek-chat", phase: "testing", outcome: "success", feedbackAttempts: 0 }),
      },
    });

    await aggregateRunMetrics("run-1");

    // Two distinct (modelId, phase) pairs → two upserts
    expect(mockModelPerfStatUpsert).toHaveBeenCalledTimes(2);
  });

  it("skips entries where modelId === 'none'", async () => {
    mockPipelineRunFindUnique.mockResolvedValueOnce({
      stepMetrics: {
        "0": makeMetric({ modelId: "none", phase: "other" }),
        "1": makeMetric({ modelId: "deepseek-chat", phase: "implementation" }),
      },
    });

    await aggregateRunMetrics("run-1");

    // Only 1 upsert — the "none" entry is skipped
    expect(mockModelPerfStatUpsert).toHaveBeenCalledTimes(1);
  });

  it("silently exits when stepMetrics is not a plain object (null, array, string)", async () => {
    for (const val of [null, [], "string", 42]) {
      mockPipelineRunFindUnique.mockResolvedValueOnce({ stepMetrics: val });
      await expect(aggregateRunMetrics("run-1")).resolves.toBeUndefined();
    }
    expect(mockModelPerfStatUpsert).not.toHaveBeenCalled();
  });

  it("logs warn and does not throw when Prisma upsert throws", async () => {
    mockPipelineRunFindUnique.mockResolvedValueOnce({
      stepMetrics: { "0": makeMetric() },
    });
    mockModelPerfStatUpsert.mockRejectedValueOnce(new Error("upsert failed"));

    await expect(aggregateRunMetrics("run-1")).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getModelStats
// ---------------------------------------------------------------------------

describe("getModelStats", () => {
  it("correctly calculates avgInputTokens, avgDurationMs, successRate", async () => {
    mockModelPerfStatFindMany.mockResolvedValueOnce([
      {
        modelId: "deepseek-chat",
        phase: "implementation",
        runCount: 4,
        successCount: 3,
        retryCount: 1,
        totalInputTokens: 8000,
        totalOutputTokens: 4000,
        totalDurationMs: 12000,
      },
    ]);

    const result = await getModelStats();

    expect(result[0].avgInputTokens).toBe(2000);
    expect(result[0].avgDurationMs).toBe(3000);
    expect(result[0].successRate).toBeCloseTo(0.75);
  });

  it("returns successRate=0 and averages=0 when runCount=0", async () => {
    mockModelPerfStatFindMany.mockResolvedValueOnce([
      {
        modelId: "some-model",
        phase: "planning",
        runCount: 0,
        successCount: 0,
        retryCount: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalDurationMs: 0,
      },
    ]);

    const result = await getModelStats();

    expect(result[0].avgInputTokens).toBe(0);
    expect(result[0].avgDurationMs).toBe(0);
    expect(result[0].successRate).toBe(0);
  });

  it("passes where: { phase } filter when phase param is present", async () => {
    mockModelPerfStatFindMany.mockResolvedValueOnce([]);
    await getModelStats("planning");

    expect(mockModelPerfStatFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { phase: "planning" } }),
    );
  });

  it("returns empty array when no stats in DB", async () => {
    mockModelPerfStatFindMany.mockResolvedValueOnce([]);
    const result = await getModelStats();
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getPipelineSummary
// ---------------------------------------------------------------------------

describe("getPipelineSummary", () => {
  function makeGroupByResult(counts: Record<string, number>) {
    return Object.entries(counts).map(([status, count]) => ({
      status,
      _count: { id: count },
    }));
  }

  it("correctly maps status counts from groupBy result", async () => {
    mockPipelineRunGroupBy.mockResolvedValueOnce(
      makeGroupByResult({ COMPLETED: 3, FAILED: 1, CANCELLED: 1, RUNNING: 0, PENDING: 0 }),
    );
    mockPipelineRunFindMany.mockResolvedValueOnce([]);

    const result = await getPipelineSummary("agent-1");

    expect(result.total).toBe(5);
    expect(result.completed).toBe(3);
    expect(result.failed).toBe(1);
    expect(result.cancelled).toBe(1);
    expect(result.running).toBe(0);
  });

  it("correctly calculates avgDurationMs from completed runs", async () => {
    mockPipelineRunGroupBy.mockResolvedValueOnce(
      makeGroupByResult({ COMPLETED: 2, FAILED: 0 }),
    );
    const base = new Date("2026-01-01T00:00:00Z");
    mockPipelineRunFindMany.mockResolvedValueOnce([
      { startedAt: new Date(base.getTime()), completedAt: new Date(base.getTime() + 3000) },
      { startedAt: new Date(base.getTime()), completedAt: new Date(base.getTime() + 5000) },
    ]);

    const result = await getPipelineSummary("agent-1");

    expect(result.avgDurationMs).toBe(4000); // (3000 + 5000) / 2
  });

  it("successRate = completed / total", async () => {
    mockPipelineRunGroupBy.mockResolvedValueOnce(
      makeGroupByResult({ COMPLETED: 3, FAILED: 1, CANCELLED: 1 }),
    );
    mockPipelineRunFindMany.mockResolvedValueOnce([]);

    const result = await getPipelineSummary("agent-1");

    expect(result.successRate).toBeCloseTo(3 / 5);
  });

  it("counts RUNNING + PENDING both as running", async () => {
    mockPipelineRunGroupBy.mockResolvedValueOnce(
      makeGroupByResult({ COMPLETED: 2, RUNNING: 1, PENDING: 2 }),
    );
    mockPipelineRunFindMany.mockResolvedValueOnce([]);

    const result = await getPipelineSummary("agent-1");

    expect(result.running).toBe(3); // RUNNING(1) + PENDING(2)
    expect(result.total).toBe(5);
  });

  it("successRate is 0 and no division by zero when total=0", async () => {
    mockPipelineRunGroupBy.mockResolvedValueOnce([]);
    mockPipelineRunFindMany.mockResolvedValueOnce([]);

    const result = await getPipelineSummary("agent-empty");

    expect(result.total).toBe(0);
    expect(result.successRate).toBe(0);
    expect(result.avgDurationMs).toBe(0);
    expect(result.cancelled).toBe(0);
    expect(result.running).toBe(0);
  });

  it("all runs cancelled — successRate=0, completed=0", async () => {
    mockPipelineRunGroupBy.mockResolvedValueOnce(
      makeGroupByResult({ CANCELLED: 5 }),
    );
    mockPipelineRunFindMany.mockResolvedValueOnce([]);

    const result = await getPipelineSummary("agent-cancelled");

    expect(result.total).toBe(5);
    expect(result.completed).toBe(0);
    expect(result.cancelled).toBe(5);
    expect(result.successRate).toBe(0);
  });
});
