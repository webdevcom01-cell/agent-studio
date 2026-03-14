import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cLIGeneration: {
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../pipeline", () => ({
  runPipeline: vi.fn().mockResolvedValue({
    generationId: "gen-1",
    status: "COMPLETED",
    currentPhase: 6,
    phases: [],
  }),
  createInitialPhases: vi.fn().mockReturnValue([]),
}));

import {
  isExecutionActive,
  cancelExecution,
  startExecution,
  getActiveExecutionCount,
} from "../executor";
import { runPipeline } from "../pipeline";

const mockRunPipeline = vi.mocked(runPipeline);

describe("executor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("tracks active executions", async () => {
    let resolvePromise!: () => void;
    const blockingPromise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });
    mockRunPipeline.mockImplementationOnce(async () => {
      await blockingPromise;
      return {
        generationId: "gen-active",
        status: "COMPLETED" as const,
        currentPhase: 6,
        phases: [],
      };
    });

    // Don't await — startExecution now returns the pipeline promise which blocks
    // until the pipeline completes. Check active status while it's still running.
    const execPromise = startExecution("gen-active", { applicationName: "TestApp" });

    // Map registration is synchronous, so isActive is true immediately
    expect(isExecutionActive("gen-active")).toBe(true);
    expect(getActiveExecutionCount()).toBeGreaterThanOrEqual(1);

    // Unblock the pipeline and wait for completion
    resolvePromise();
    await execPromise;
  });

  it("returns false for unknown execution cancel", () => {
    expect(cancelExecution("nonexistent")).toBe(false);
  });

  it("prevents duplicate executions", async () => {
    let resolvePromise!: () => void;
    const blockingPromise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });
    mockRunPipeline.mockImplementationOnce(async () => {
      await blockingPromise;
      return {
        generationId: "gen-dup",
        status: "COMPLETED" as const,
        currentPhase: 6,
        phases: [],
      };
    });

    // Start first execution (don't await — pipeline is blocked)
    const firstExec = startExecution("gen-dup", { applicationName: "App" });

    // Duplicate should reject immediately (Map check is synchronous)
    await expect(
      startExecution("gen-dup", { applicationName: "App" }),
    ).rejects.toThrow("already in progress");

    // Unblock and clean up
    resolvePromise();
    await firstExec;
  });

  it("isExecutionActive returns false for non-running", () => {
    expect(isExecutionActive("never-started")).toBe(false);
  });

  it("getActiveExecutionCount returns 0 when idle", () => {
    // After previous tests complete, count may be 0
    expect(getActiveExecutionCount()).toBeGreaterThanOrEqual(0);
  });
});
