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

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pipelineRun: {
      create: (...args: unknown[]) => mockCreate(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
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
  it("increments currentStep and records step output", async () => {
    mockFindUnique.mockResolvedValue(makeRow({ stepResults: {} }));
    const row = makeRow({ currentStep: 1, stepResults: { "0": "planner output" } });
    mockUpdate.mockResolvedValue(row);

    const result = await advancePipelineStep("run-1", 0, "planner output");

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

  it("throws if run is already CANCELLED", async () => {
    mockFindUnique.mockResolvedValue(makeRow({ status: "CANCELLED" }));
    await expect(cancelPipelineRun("run-1")).rejects.toThrow("terminal status");
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
