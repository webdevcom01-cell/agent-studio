import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock BullMQ Queue
const mockAdd = vi.fn();
const mockGetJob = vi.fn();
const mockClose = vi.fn();

vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: mockAdd,
    getJob: mockGetJob,
    close: mockClose,
  })),
  QueueEvents: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    off: vi.fn(),
    close: vi.fn(),
  })),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Must stub REDIS_URL before importing queue module
vi.stubEnv("REDIS_URL", "redis://localhost:6379");

import { addFlowJob, addEvalJob, getJobStatus, closeQueue } from "../index";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Queue — addFlowJob", () => {
  it("adds a flow job with chat priority", async () => {
    mockAdd.mockResolvedValueOnce({ id: "job-123" });

    const jobId = await addFlowJob({
      agentId: "agent-1",
      conversationId: "conv-1",
      userMessage: "Hello",
      streaming: false,
      priority: "chat",
    });

    expect(jobId).toBe("job-123");
    expect(mockAdd).toHaveBeenCalledWith(
      "flow.execute",
      expect.objectContaining({
        type: "flow.execute",
        agentId: "agent-1",
        priority: "chat",
      }),
      expect.objectContaining({ priority: 1 }),
    );
  });

  it("adds a flow job with pipeline priority", async () => {
    mockAdd.mockResolvedValueOnce({ id: "job-456" });

    await addFlowJob({
      agentId: "agent-2",
      conversationId: "conv-2",
      streaming: true,
      priority: "pipeline",
    });

    expect(mockAdd).toHaveBeenCalledWith(
      "flow.execute",
      expect.objectContaining({ priority: "pipeline" }),
      expect.objectContaining({ priority: 5 }),
    );
  });
});

describe("Queue — addEvalJob", () => {
  it("adds an eval job with low priority", async () => {
    mockAdd.mockResolvedValueOnce({ id: "eval-789" });

    const jobId = await addEvalJob({
      suiteId: "suite-1",
      agentId: "agent-1",
      triggeredBy: "manual",
      baseUrl: "http://localhost:3000",
    });

    expect(jobId).toBe("eval-789");
    expect(mockAdd).toHaveBeenCalledWith(
      "eval.run",
      expect.objectContaining({ type: "eval.run" }),
      expect.objectContaining({ priority: 10 }),
    );
  });
});

describe("Queue — getJobStatus", () => {
  it("returns job status when found", async () => {
    mockGetJob.mockResolvedValueOnce({
      progress: 50,
      returnvalue: { success: true },
      failedReason: undefined,
      getState: vi.fn().mockResolvedValue("active"),
    });

    const status = await getJobStatus("job-123");

    expect(status).toEqual({
      state: "active",
      progress: 50,
      result: { success: true },
      failedReason: undefined,
    });
  });

  it("returns null when job not found", async () => {
    mockGetJob.mockResolvedValueOnce(null);

    const status = await getJobStatus("nonexistent");
    expect(status).toBeNull();
  });
});

describe("Queue — closeQueue", () => {
  it("closes without error", async () => {
    await closeQueue();
    // No assertion needed — just verify it doesn't throw
  });
});
