import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRunTaskWithPolling = vi.fn();

vi.mock("@/lib/mcp/task-client", () => ({
  runTaskWithPolling: (...args: unknown[]) => mockRunTaskWithPolling(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { mcpTaskRunnerHandler } from "../mcp-task-runner-handler";
import type { RuntimeContext } from "../../types";
import type { FlowNode, FlowContent } from "@/types";

function makeNode(overrides: Record<string, unknown> = {}): FlowNode {
  return {
    id: "task-1",
    type: "mcp_task_runner",
    position: { x: 0, y: 0 },
    data: {
      mcpServerUrl: "http://mcp:8000",
      taskName: "compute_embeddings",
      inputMapping: [],
      pollIntervalMs: 100,
      maxDurationMs: 5000,
      retryOnFailure: true,
      outputVariable: "task_result",
      ...overrides,
    },
  };
}

function makeContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: { nodes: [], edges: [], variables: [] } as FlowContent,
    currentNodeId: "task-1",
    variables: {},
    messageHistory: [],
    isNewConversation: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("mcpTaskRunnerHandler", () => {
  it("returns error when server URL is missing", async () => {
    const result = await mcpTaskRunnerHandler(
      makeNode({ mcpServerUrl: "" }),
      makeContext(),
    );
    expect(result.messages[0].content).toContain("no server URL");
  });

  it("returns error when task name is missing", async () => {
    const result = await mcpTaskRunnerHandler(
      makeNode({ taskName: "" }),
      makeContext(),
    );
    expect(result.messages[0].content).toContain("no task name");
  });

  it("completes task successfully", async () => {
    mockRunTaskWithPolling.mockResolvedValueOnce({
      taskId: "t-123",
      status: "completed",
      progress: 100,
      result: { embeddings: [[0.1, 0.2]] },
      error: null,
    });

    const result = await mcpTaskRunnerHandler(makeNode(), makeContext());
    const output = result.updatedVariables?.task_result as Record<string, unknown>;
    expect(output.status).toBe("completed");
    expect(output.taskId).toBe("t-123");
    expect(output.retryCount).toBe(0);
  });

  it("handles task timeout", async () => {
    mockRunTaskWithPolling.mockResolvedValueOnce({
      taskId: "t-456",
      status: "failed",
      progress: 0,
      result: null,
      error: "Task timed out after 5000ms",
    });

    // After first failure, retry should also fail
    mockRunTaskWithPolling.mockResolvedValueOnce({
      taskId: "t-789",
      status: "failed",
      progress: 0,
      result: null,
      error: "Task timed out",
    });
    mockRunTaskWithPolling.mockResolvedValueOnce({
      taskId: "t-000",
      status: "failed",
      progress: 0,
      result: null,
      error: "Task timed out",
    });

    const result = await mcpTaskRunnerHandler(makeNode(), makeContext());
    const output = result.updatedVariables?.task_result as Record<string, unknown>;
    expect(output.status).toBe("failed");
    expect(output.retryCount).toBe(2);
  });

  it("handles cancelled task", async () => {
    mockRunTaskWithPolling.mockResolvedValueOnce({
      taskId: "t-cancel",
      status: "cancelled",
      progress: 30,
      result: null,
      error: null,
    });

    const result = await mcpTaskRunnerHandler(makeNode(), makeContext());
    const output = result.updatedVariables?.task_result as Record<string, unknown>;
    expect(output.status).toBe("cancelled");
  });

  it("retries on failure then succeeds", async () => {
    mockRunTaskWithPolling
      .mockRejectedValueOnce(new Error("Connection refused"))
      .mockResolvedValueOnce({
        taskId: "t-retry",
        status: "completed",
        progress: 100,
        result: { ok: true },
        error: null,
      });

    const result = await mcpTaskRunnerHandler(makeNode(), makeContext());
    const output = result.updatedVariables?.task_result as Record<string, unknown>;
    expect(output.status).toBe("completed");
    expect(output.retryCount).toBe(1);
  });

  it("skips retries when retryOnFailure is false", async () => {
    mockRunTaskWithPolling.mockRejectedValueOnce(new Error("Server down"));

    const result = await mcpTaskRunnerHandler(
      makeNode({ retryOnFailure: false }),
      makeContext(),
    );
    const output = result.updatedVariables?.task_result as Record<string, unknown>;
    expect(output.status).toBe("failed");
    expect(output.retryCount).toBe(0);
    expect(mockRunTaskWithPolling).toHaveBeenCalledTimes(1);
  });
});
