/**
 * Unit tests for sdlc/pipeline-manager.ts
 * Prisma is mocked — no DB required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Prisma mock
// ---------------------------------------------------------------------------

const mockCreate = vi.fn();
const mockFindUnique = vi.fn();
const mockFindMany = vi.fn();
const mockCount = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateMany = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pipelineRun: {
      create: (...args: unknown[]) => mockCreate(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import {
  createPipelineRun,
  getPipelineRun,
  listPipelineRuns,
  markPipelineRunning,
  markPipelineCompleted,
  markPipelineFailed,
  advancePipelineStep,
  cancelPipelineRun,
  isPipelineCancelled,
  detectAndResetStalePipelineRuns,
  saveStepOutput,
  isRunStuck,
  PIPELINE_STUCK_THRESHOLD_MS,
} from "../pipeline-manager";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "run-1",
    status: "PENDING" as const,
    taskDescription: "Build a new user authentication feature",
    taskType: "new-feature",
    complexity: "moderate",
    pipeline: ["project_context", "ecc-planner", "ecc-code-reviewer"],
    currentStep: 0,
    stepResults: {},
    finalOutput: null,
    error: null,
    jobId: null,
    agentId: "agent-1",
    userId: "user-1",
    startedAt: null,
    completedAt: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // $transaction executes the callback with a proxy that delegates to the same mocks
  mockTransaction.mockImplementation(async (fn: (tx: Record<string, Record<string, unknown>>) => Promise<unknown>) => {
    return fn({
      pipelineRun: {
        findUnique: mockFindUnique,
        update: mockUpdate,
      },
    });
  });
});

// ---------------------------------------------------------------------------
// createPipelineRun
// ---------------------------------------------------------------------------

describe("createPipelineRun", () => {
  it("creates a run with PENDING status", async () => {
    const row = makeRow();
    mockCreate.mockResolvedValue(row);

    const result = await createPipelineRun({
      taskDescription: "Build a new user authentication feature",
      taskType: "new-feature",
      complexity: "moderate",
      pipeline: ["project_context", "ecc-planner", "ecc-code-reviewer"],
      agentId: "agent-1",
      userId: "user-1",
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          taskType: "new-feature",
          complexity: "moderate",
          agentId: "agent-1",
          status: "PENDING",
        }),
      }),
    );
    expect(result.id).toBe("run-1");
    expect(result.status).toBe("PENDING");
    expect(result.pipeline).toHaveLength(3);
  });

  it("converts null stepResults to empty object", async () => {
    mockCreate.mockResolvedValue(makeRow({ stepResults: null }));
    const result = await createPipelineRun({
      taskDescription: "test",
      taskType: "code-review",
      complexity: "simple",
      pipeline: ["ecc-code-reviewer"],
      agentId: "agent-1",
    });
    expect(result.stepResults).toEqual({});
  });

  it("handles array stepResults fallback to empty object", async () => {
    mockCreate.mockResolvedValue(makeRow({ stepResults: [] }));
    const result = await createPipelineRun({
      taskDescription: "test",
      taskType: "code-review",
      complexity: "simple",
      pipeline: ["ecc-code-reviewer"],
      agentId: "agent-1",
    });
    expect(result.stepResults).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// getPipelineRun
// ---------------------------------------------------------------------------

describe("getPipelineRun", () => {
  it("returns run when found", async () => {
    mockFindUnique.mockResolvedValue(makeRow());
    const result = await getPipelineRun("run-1");
    expect(result?.id).toBe("run-1");
  });

  it("returns null when not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    const result = await getPipelineRun("missing");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// listPipelineRuns
// ---------------------------------------------------------------------------

describe("listPipelineRuns", () => {
  it("returns runs and total", async () => {
    mockFindMany.mockResolvedValue([makeRow({ id: "r1" }), makeRow({ id: "r2" })]);
    mockCount.mockResolvedValue(2);

    const result = await listPipelineRuns("agent-1");
    expect(result.runs).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it("filters by status", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await listPipelineRuns("agent-1", { status: "RUNNING" });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "RUNNING" }),
      }),
    );
  });

  it("caps limit at 100", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await listPipelineRuns("agent-1", { limit: 9999 });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
  });
});

// ---------------------------------------------------------------------------
// markPipelineRunning
// ---------------------------------------------------------------------------

describe("markPipelineRunning", () => {
  it("sets status to RUNNING with jobId", async () => {
    const row = makeRow({ status: "RUNNING", jobId: "job-abc", startedAt: new Date() });
    mockUpdate.mockResolvedValue(row);

    const result = await markPipelineRunning("run-1", "job-abc");

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "RUNNING",
          jobId: "job-abc",
          currentStep: 0,
        }),
      }),
    );
    expect(result.status).toBe("RUNNING");
    expect(result.jobId).toBe("job-abc");
  });
});

// ---------------------------------------------------------------------------
// advancePipelineStep
// ---------------------------------------------------------------------------

describe("advancePipelineStep", () => {
  it("increments currentStep and records step output inside a transaction", async () => {
    mockFindUnique.mockResolvedValue(makeRow({ stepResults: {} }));
    const row = makeRow({ currentStep: 1, stepResults: { "0": "planner output" } });
    mockUpdate.mockResolvedValue(row);

    const result = await advancePipelineStep("run-1", 0, "planner output");

    // Must use $transaction for atomicity
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentStep: 1,
          stepResults: { "0": "planner output" },
        }),
      }),
    );
    expect(result.currentStep).toBe(1);
  });

  it("merges new step output with existing stepResults", async () => {
    mockFindUnique.mockResolvedValue(
      makeRow({ stepResults: { "0": "first step output" } }),
    );
    const row = makeRow({
      currentStep: 2,
      stepResults: { "0": "first step output", "1": "second step output" },
    });
    mockUpdate.mockResolvedValue(row);

    await advancePipelineStep("run-1", 1, "second step output");

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stepResults: { "0": "first step output", "1": "second step output" },
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// markPipelineCompleted
// ---------------------------------------------------------------------------

describe("markPipelineCompleted", () => {
  it("sets status to COMPLETED with finalOutput", async () => {
    const row = makeRow({ status: "COMPLETED", finalOutput: "All steps done." });
    mockUpdate.mockResolvedValue(row);

    const result = await markPipelineCompleted("run-1", "All steps done.");

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "COMPLETED",
          finalOutput: "All steps done.",
        }),
      }),
    );
    expect(result.status).toBe("COMPLETED");
    expect(result.finalOutput).toBe("All steps done.");
  });
});

// ---------------------------------------------------------------------------
// markPipelineFailed
// ---------------------------------------------------------------------------

describe("markPipelineFailed", () => {
  it("sets status to FAILED with error", async () => {
    const row = makeRow({ status: "FAILED", error: "Step 2 crashed" });
    mockUpdate.mockResolvedValue(row);

    const result = await markPipelineFailed("run-1", "Step 2 crashed");

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          error: "Step 2 crashed",
        }),
      }),
    );
    expect(result.status).toBe("FAILED");
    expect(result.error).toBe("Step 2 crashed");
  });
});

// ---------------------------------------------------------------------------
// cancelPipelineRun
// ---------------------------------------------------------------------------

describe("cancelPipelineRun", () => {
  it("cancels a PENDING run", async () => {
    mockFindUnique.mockResolvedValue(makeRow({ status: "PENDING" }));
    mockUpdate.mockResolvedValue(makeRow({ status: "CANCELLED" }));

    const result = await cancelPipelineRun("run-1");
    expect(result.status).toBe("CANCELLED");
  });

  it("cancels a RUNNING run", async () => {
    mockFindUnique.mockResolvedValue(makeRow({ status: "RUNNING" }));
    mockUpdate.mockResolvedValue(makeRow({ status: "CANCELLED" }));

    const result = await cancelPipelineRun("run-1");
    expect(result.status).toBe("CANCELLED");
  });

  it("throws if run is already COMPLETED", async () => {
    mockFindUnique.mockResolvedValue(makeRow({ status: "COMPLETED" }));
    await expect(cancelPipelineRun("run-1")).rejects.toThrow("terminal status");
  });

  it("throws if run is already FAILED", async () => {
    mockFindUnique.mockResolvedValue(makeRow({ status: "FAILED" }));
    await expect(cancelPipelineRun("run-1")).rejects.toThrow("terminal status");
  });

  it("returns current state idempotently when already CANCELLED", async () => {
    mockFindUnique.mockResolvedValue(makeRow({ status: "CANCELLED" }));
    const result = await cancelPipelineRun("run-1");
    expect(result.status).toBe("CANCELLED");
    // Should NOT call update — already in desired state
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("throws if run not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    await expect(cancelPipelineRun("missing")).rejects.toThrow("not found");
  });
});

// ---------------------------------------------------------------------------
// isPipelineCancelled
// ---------------------------------------------------------------------------

describe("isPipelineCancelled", () => {
  it("returns true when status is CANCELLED", async () => {
    mockFindUnique.mockResolvedValue({ status: "CANCELLED" });
    expect(await isPipelineCancelled("run-1")).toBe(true);
  });

  it("returns false when status is RUNNING", async () => {
    mockFindUnique.mockResolvedValue({ status: "RUNNING" });
    expect(await isPipelineCancelled("run-1")).toBe(false);
  });

  it("returns false when run not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    expect(await isPipelineCancelled("missing")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// markPipelineRunning — startFromStep
// ---------------------------------------------------------------------------

describe("markPipelineRunning — startFromStep", () => {
  it("defaults currentStep to 0 when startFromStep not provided", async () => {
    const row = makeRow({ status: "RUNNING", jobId: "job-1", startedAt: new Date(), currentStep: 0 });
    mockUpdate.mockResolvedValue(row);

    await markPipelineRunning("run-1", "job-1");

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentStep: 0 }),
      }),
    );
  });

  it("sets currentStep to startFromStep when provided", async () => {
    const row = makeRow({ status: "RUNNING", jobId: "job-resume", startedAt: new Date(), currentStep: 5 });
    mockUpdate.mockResolvedValue(row);

    await markPipelineRunning("run-1", "job-resume", 5);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentStep: 5 }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// detectAndResetStalePipelineRuns
// ---------------------------------------------------------------------------

describe("detectAndResetStalePipelineRuns", () => {
  it("marks stale RUNNING runs as FAILED via updateMany", async () => {
    const staleRun = makeRow({
      status: "RUNNING",
      startedAt: new Date(Date.now() - 60 * 60 * 1000),
      currentStep: 3,
      pipeline: ["project_context", "ecc-planner", "ecc-code-reviewer", "ecc-implementer"],
    });
    mockFindMany.mockResolvedValue([staleRun]);
    mockUpdateMany.mockResolvedValue({ count: 1 });

    const result = await detectAndResetStalePipelineRuns(45);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "RUNNING",
          startedAt: expect.objectContaining({ lt: expect.any(Date) }),
        }),
      }),
    );
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: [staleRun.id] } }),
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
    expect(result.resetCount).toBe(1);
    expect(result.runIds).toEqual([staleRun.id]);
  });

  it("does NOT reset RUNNING runs within the threshold", async () => {
    mockFindMany.mockResolvedValue([]);
    mockUpdateMany.mockResolvedValue({ count: 0 });

    const result = await detectAndResetStalePipelineRuns(45);

    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(result.resetCount).toBe(0);
    expect(result.runIds).toEqual([]);
  });

  it("dryRun returns stale count without calling updateMany", async () => {
    const staleRun = makeRow({
      status: "RUNNING",
      startedAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    mockFindMany.mockResolvedValue([staleRun]);

    const result = await detectAndResetStalePipelineRuns(45, true);

    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(result.resetCount).toBe(1);
    expect(result.runIds).toEqual([staleRun.id]);
  });

  it("uses 45-minute default threshold", async () => {
    mockFindMany.mockResolvedValue([]);

    await detectAndResetStalePipelineRuns();

    const call = mockFindMany.mock.calls[0][0] as { where: { startedAt: { lt: Date } } };
    const cutoff = call.where.startedAt.lt;
    const diffMin = (Date.now() - cutoff.getTime()) / 60_000;
    expect(diffMin).toBeGreaterThan(44);
    expect(diffMin).toBeLessThan(46);
  });
});

// ---------------------------------------------------------------------------
// saveStepOutput — Phase 12
// ---------------------------------------------------------------------------

describe("saveStepOutput", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves step output without advancing currentStep", async () => {
    // Simulate the $transaction executing the callback
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        pipelineRun: {
          findUnique: mockFindUnique,
          update: mockUpdate,
        },
      };
      return cb(tx);
    });

    const existingRow = makeRow({ stepResults: { "0": "discovery output" }, currentStep: 1 });
    mockFindUnique.mockResolvedValue(existingRow);
    mockUpdate.mockResolvedValue({ ...existingRow, stepResults: { "0": "discovery output", "1": "gate blocked output" } });

    await saveStepOutput("run-1", 1, "gate blocked output");

    // Should call update with merged stepResults but NO currentStep change
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-1" },
        data: expect.objectContaining({
          stepResults: { "0": "discovery output", "1": "gate blocked output" },
          // currentStep must NOT appear in the update data
        }),
      }),
    );

    const updateCall = mockUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(updateCall.data).not.toHaveProperty("currentStep");
  });

  it("creates stepResults from scratch when run has no prior results", async () => {
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        pipelineRun: {
          findUnique: mockFindUnique,
          update: mockUpdate,
        },
      };
      return cb(tx);
    });

    const emptyRow = makeRow({ stepResults: null, currentStep: 0 });
    mockFindUnique.mockResolvedValue(emptyRow);
    mockUpdate.mockResolvedValue({ ...emptyRow, stepResults: { "0": "first output" } });

    await saveStepOutput("run-1", 0, "first output");

    const updateCall = mockUpdate.mock.calls[0][0] as { data: { stepResults: Record<string, string> } };
    expect(updateCall.data.stepResults).toEqual({ "0": "first output" });
    expect(updateCall.data).not.toHaveProperty("currentStep");
  });

  it("preserves existing step results when adding a new one", async () => {
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        pipelineRun: {
          findUnique: mockFindUnique,
          update: mockUpdate,
        },
      };
      return cb(tx);
    });

    const rowWithHistory = makeRow({
      stepResults: { "0": "step0", "1": "step1", "2": "step2" },
      currentStep: 3,
    });
    mockFindUnique.mockResolvedValue(rowWithHistory);
    mockUpdate.mockResolvedValue(rowWithHistory);

    await saveStepOutput("run-1", 3, "gate reviewer report");

    const updateCall = mockUpdate.mock.calls[0][0] as { data: { stepResults: Record<string, string> } };
    expect(updateCall.data.stepResults).toEqual({
      "0": "step0",
      "1": "step1",
      "2": "step2",
      "3": "gate reviewer report",
    });
    expect(updateCall.data).not.toHaveProperty("currentStep");
  });
});

// ---------------------------------------------------------------------------
// isRunStuck (Faza 3 — 3.1 stuck detection)
// ---------------------------------------------------------------------------

describe("isRunStuck", () => {
  it("returns false for non-RUNNING status", () => {
    const run = { status: "FAILED", updatedAt: new Date(0) };
    expect(isRunStuck(run)).toBe(false);
  });

  it("returns false for PENDING status even with stale updatedAt", () => {
    const staleTime = new Date(Date.now() - 11 * 60 * 1000);
    const run = { status: "PENDING", updatedAt: staleTime };
    expect(isRunStuck(run)).toBe(false);
  });

  it("returns false for RUNNING run updated recently", () => {
    const run = { status: "RUNNING", updatedAt: new Date() };
    expect(isRunStuck(run)).toBe(false);
  });

  it("returns true for RUNNING run with stale updatedAt (11 min ago)", () => {
    const staleTime = new Date(Date.now() - 11 * 60 * 1000);
    const run = { status: "RUNNING", updatedAt: staleTime };
    expect(isRunStuck(run)).toBe(true);
  });

  it("returns false exactly at threshold (1 second before threshold)", () => {
    const atThreshold = new Date(Date.now() - PIPELINE_STUCK_THRESHOLD_MS + 1000);
    const run = { status: "RUNNING", updatedAt: atThreshold };
    expect(isRunStuck(run)).toBe(false);
  });

  it("returns true just past threshold (1 second after)", () => {
    const justPast = new Date(Date.now() - PIPELINE_STUCK_THRESHOLD_MS - 1000);
    const run = { status: "RUNNING", updatedAt: justPast };
    expect(isRunStuck(run)).toBe(true);
  });
});
