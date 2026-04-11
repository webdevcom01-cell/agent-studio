/**
 * Unit tests for managed-tasks/manager.ts
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
    managedAgentTask: {
      create: (...args: unknown[]) => mockCreate(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import {
  createTask,
  getTask,
  listTasks,
  markRunning,
  markCompleted,
  markFailed,
  requestPause,
  requestResume,
  cancelTask,
  updateProgress,
  isCancelled,
  isPaused,
} from "../manager";

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    name: "Test Task",
    description: null,
    status: "PENDING" as const,
    jobId: null,
    input: { task: "Do something", model: "claude-sonnet-4-6" },
    output: null,
    error: null,
    progress: 0,
    callbackUrl: null,
    agentId: "agent-1",
    userId: "user-1",
    startedAt: null,
    completedAt: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// createTask
// ---------------------------------------------------------------------------

describe("createTask", () => {
  it("creates a task with PENDING status", async () => {
    const row = makeRow();
    mockCreate.mockResolvedValue(row);

    const result = await createTask({
      name: "Test Task",
      agentId: "agent-1",
      userId: "user-1",
      input: { task: "Do something", model: "claude-sonnet-4-6" },
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Test Task",
          agentId: "agent-1",
          userId: "user-1",
          status: "PENDING",
        }),
      })
    );
    expect(result.id).toBe("task-1");
    expect(result.status).toBe("PENDING");
  });

  it("maps JSON input/output fields correctly", async () => {
    const row = makeRow({
      input: { task: "hello", maxSteps: 10 },
      output: { result: "done", inputTokens: 100, outputTokens: 50, durationMs: 500 },
    });
    mockCreate.mockResolvedValue(row);

    const result = await createTask({
      name: "T",
      agentId: "a",
      input: { task: "hello", maxSteps: 10 },
    });

    expect(result.input.task).toBe("hello");
    expect(result.input.maxSteps).toBe(10);
    expect(result.output?.result).toBe("done");
    expect(result.output?.inputTokens).toBe(100);
  });

  it("sets output to null when DB row output is null", async () => {
    mockCreate.mockResolvedValue(makeRow({ output: null }));
    const result = await createTask({
      name: "T",
      agentId: "a",
      input: { task: "hi" },
    });
    expect(result.output).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getTask
// ---------------------------------------------------------------------------

describe("getTask", () => {
  it("returns task when found", async () => {
    mockFindUnique.mockResolvedValue(makeRow());
    const result = await getTask("task-1");
    expect(result?.id).toBe("task-1");
  });

  it("returns null when not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    const result = await getTask("missing");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// listTasks
// ---------------------------------------------------------------------------

describe("listTasks", () => {
  it("returns tasks and total", async () => {
    const rows = [makeRow({ id: "t1" }), makeRow({ id: "t2" })];
    mockFindMany.mockResolvedValue(rows);
    mockCount.mockResolvedValue(2);

    const result = await listTasks("agent-1");
    expect(result.tasks).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it("filters by status", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await listTasks("agent-1", { status: "RUNNING" });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "RUNNING" }),
      })
    );
  });

  it("caps limit at 100", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await listTasks("agent-1", { limit: 9999 });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 })
    );
  });
});

// ---------------------------------------------------------------------------
// markRunning
// ---------------------------------------------------------------------------

describe("markRunning", () => {
  it("sets status to RUNNING with jobId and startedAt", async () => {
    const row = makeRow({ status: "RUNNING", jobId: "job-123", startedAt: new Date() });
    mockUpdate.mockResolvedValue(row);

    const result = await markRunning("task-1", "job-123");

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "RUNNING",
          jobId: "job-123",
          progress: 0,
        }),
      })
    );
    expect(result.status).toBe("RUNNING");
  });
});

// ---------------------------------------------------------------------------
// markCompleted
// ---------------------------------------------------------------------------

describe("markCompleted", () => {
  it("sets status to COMPLETED with output and progress 100", async () => {
    const output = {
      result: "done",
      inputTokens: 100,
      outputTokens: 50,
      durationMs: 1000,
    };
    const row = makeRow({ status: "COMPLETED", output, progress: 100 });
    mockUpdate.mockResolvedValue(row);

    const result = await markCompleted("task-1", output);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "COMPLETED",
          progress: 100,
        }),
      })
    );
    expect(result.status).toBe("COMPLETED");
  });
});

// ---------------------------------------------------------------------------
// markFailed
// ---------------------------------------------------------------------------

describe("markFailed", () => {
  it("sets status to FAILED with error message", async () => {
    const row = makeRow({ status: "FAILED", error: "Something broke" });
    mockUpdate.mockResolvedValue(row);

    const result = await markFailed("task-1", "Something broke");

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          error: "Something broke",
        }),
      })
    );
    expect(result.status).toBe("FAILED");
    expect(result.error).toBe("Something broke");
  });
});

// ---------------------------------------------------------------------------
// requestPause
// ---------------------------------------------------------------------------

describe("requestPause", () => {
  it("pauses a RUNNING task", async () => {
    mockFindUnique.mockResolvedValue(makeRow({ status: "RUNNING" }));
    mockUpdate.mockResolvedValue(makeRow({ status: "PAUSED" }));

    const result = await requestPause("task-1");
    expect(result.status).toBe("PAUSED");
  });

  it("throws if task not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    await expect(requestPause("missing")).rejects.toThrow("Task not found");
  });

  it("throws if task is not RUNNING", async () => {
    mockFindUnique.mockResolvedValue(makeRow({ status: "PENDING" }));
    await expect(requestPause("task-1")).rejects.toThrow("Cannot pause task");
  });
});

// ---------------------------------------------------------------------------
// requestResume
// ---------------------------------------------------------------------------

describe("requestResume", () => {
  it("resumes a PAUSED task back to PENDING", async () => {
    mockFindUnique.mockResolvedValue(makeRow({ status: "PAUSED" }));
    mockUpdate.mockResolvedValue(makeRow({ status: "PENDING" }));

    const result = await requestResume("task-1");
    expect(result.status).toBe("PENDING");
  });

  it("throws if task is not PAUSED", async () => {
    mockFindUnique.mockResolvedValue(makeRow({ status: "RUNNING" }));
    await expect(requestResume("task-1")).rejects.toThrow("Cannot resume task");
  });
});

// ---------------------------------------------------------------------------
// cancelTask
// ---------------------------------------------------------------------------

describe("cancelTask", () => {
  it("cancels a PENDING task", async () => {
    mockFindUnique.mockResolvedValue(makeRow({ status: "PENDING" }));
    mockUpdate.mockResolvedValue(makeRow({ status: "CANCELLED" }));

    const result = await cancelTask("task-1");
    expect(result.status).toBe("CANCELLED");
  });

  it("cancels a RUNNING task", async () => {
    mockFindUnique.mockResolvedValue(makeRow({ status: "RUNNING" }));
    mockUpdate.mockResolvedValue(makeRow({ status: "CANCELLED" }));

    const result = await cancelTask("task-1");
    expect(result.status).toBe("CANCELLED");
  });

  it("cancels a PAUSED task", async () => {
    mockFindUnique.mockResolvedValue(makeRow({ status: "PAUSED" }));
    mockUpdate.mockResolvedValue(makeRow({ status: "CANCELLED" }));

    const result = await cancelTask("task-1");
    expect(result.status).toBe("CANCELLED");
  });

  it("throws if task is already in terminal status", async () => {
    mockFindUnique.mockResolvedValue(makeRow({ status: "COMPLETED" }));
    await expect(cancelTask("task-1")).rejects.toThrow("terminal status");
  });

  it("throws if task is already FAILED", async () => {
    mockFindUnique.mockResolvedValue(makeRow({ status: "FAILED" }));
    await expect(cancelTask("task-1")).rejects.toThrow("terminal status");
  });

  it("throws if task not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    await expect(cancelTask("missing")).rejects.toThrow("Task not found");
  });
});

// ---------------------------------------------------------------------------
// updateProgress
// ---------------------------------------------------------------------------

describe("updateProgress", () => {
  it("clamps progress to 0–100", async () => {
    mockUpdate.mockResolvedValue(makeRow());

    await updateProgress("task-1", 150);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ progress: 100 }),
      })
    );

    await updateProgress("task-1", -10);
    expect(mockUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ progress: 0 }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// isCancelled / isPaused
// ---------------------------------------------------------------------------

describe("isCancelled", () => {
  it("returns true when status is CANCELLED", async () => {
    mockFindUnique.mockResolvedValue({ status: "CANCELLED" });
    expect(await isCancelled("task-1")).toBe(true);
  });

  it("returns false when status is RUNNING", async () => {
    mockFindUnique.mockResolvedValue({ status: "RUNNING" });
    expect(await isCancelled("task-1")).toBe(false);
  });

  it("returns false when task not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    expect(await isCancelled("missing")).toBe(false);
  });
});

describe("isPaused", () => {
  it("returns true when status is PAUSED", async () => {
    mockFindUnique.mockResolvedValue({ status: "PAUSED" });
    expect(await isPaused("task-1")).toBe(true);
  });

  it("returns false when status is RUNNING", async () => {
    mockFindUnique.mockResolvedValue({ status: "RUNNING" });
    expect(await isPaused("task-1")).toBe(false);
  });
});
