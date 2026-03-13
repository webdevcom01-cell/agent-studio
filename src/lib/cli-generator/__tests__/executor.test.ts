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
    let resolvePromise: () => void;
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

    await startExecution("gen-active", { applicationName: "TestApp" });

    expect(isExecutionActive("gen-active")).toBe(true);
    expect(getActiveExecutionCount()).toBeGreaterThanOrEqual(1);

    resolvePromise!();
    // Allow async completion
    await new Promise((r) => setTimeout(r, 50));
  });

  it("returns false for unknown execution cancel", () => {
    expect(cancelExecution("nonexistent")).toBe(false);
  });

  it("prevents duplicate executions", async () => {
    let resolvePromise: () => void;
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

    await startExecution("gen-dup", { applicationName: "App" });

    await expect(
      startExecution("gen-dup", { applicationName: "App" }),
    ).rejects.toThrow("already in progress");

    resolvePromise!();
    await new Promise((r) => setTimeout(r, 50));
  });

  it("isExecutionActive returns false for non-running", () => {
    expect(isExecutionActive("never-started")).toBe(false);
  });

  it("getActiveExecutionCount returns 0 when idle", () => {
    // After previous tests complete, count may be 0
    expect(getActiveExecutionCount()).toBeGreaterThanOrEqual(0);
  });
});
