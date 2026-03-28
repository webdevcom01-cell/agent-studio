import { logger } from "@/lib/logger";

export interface TaskProgress {
  taskId: string;
  status: "running" | "completed" | "failed" | "cancelled";
  progress: number;
  result: unknown;
  error: string | null;
}

interface TaskStartResult {
  taskId: string;
}

const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_MAX_DURATION_MS = 3_600_000;

/**
 * MCP Tasks API client — starts long-running tasks, polls progress, handles cancellation.
 */
export async function startTask(
  serverUrl: string,
  taskName: string,
  input: Record<string, unknown>,
): Promise<TaskStartResult> {
  const response = await fetch(`${serverUrl}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tasks/create",
      id: `task-${Date.now()}`,
      params: { name: taskName, input },
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Failed to start MCP task: HTTP ${response.status}`);
  }

  const data = (await response.json()) as {
    result?: { taskId?: string };
    error?: { message?: string };
  };

  if (data.error) {
    throw new Error(data.error.message ?? "MCP task creation failed");
  }

  const taskId = data.result?.taskId;
  if (!taskId) throw new Error("No taskId returned from MCP server");

  return { taskId };
}

export async function pollTaskProgress(
  serverUrl: string,
  taskId: string,
): Promise<TaskProgress> {
  const response = await fetch(`${serverUrl}/tasks/${taskId}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Failed to poll task: HTTP ${response.status}`);
  }

  const data = (await response.json()) as {
    result?: {
      status?: string;
      progress?: number;
      output?: unknown;
      error?: string;
    };
  };

  const result = data.result ?? {};

  return {
    taskId,
    status: (result.status as TaskProgress["status"]) ?? "running",
    progress: result.progress ?? 0,
    result: result.output ?? null,
    error: result.error ?? null,
  };
}

export async function cancelTask(
  serverUrl: string,
  taskId: string,
): Promise<void> {
  try {
    await fetch(`${serverUrl}/tasks/${taskId}/cancel`, {
      method: "POST",
      signal: AbortSignal.timeout(5_000),
    });
  } catch (err) {
    logger.warn("Failed to cancel MCP task", {
      taskId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function runTaskWithPolling(
  serverUrl: string,
  taskName: string,
  input: Record<string, unknown>,
  options: {
    pollIntervalMs?: number;
    maxDurationMs?: number;
    onProgress?: (progress: TaskProgress) => void;
  } = {},
): Promise<TaskProgress> {
  const pollInterval = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxDuration = options.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;

  const { taskId } = await startTask(serverUrl, taskName, input);
  const startTime = Date.now();

  while (true) {
    const elapsed = Date.now() - startTime;
    if (elapsed > maxDuration) {
      await cancelTask(serverUrl, taskId);
      return {
        taskId,
        status: "failed",
        progress: 0,
        result: null,
        error: `Task timed out after ${maxDuration}ms`,
      };
    }

    const progress = await pollTaskProgress(serverUrl, taskId);
    options.onProgress?.(progress);

    if (progress.status === "completed" || progress.status === "failed" || progress.status === "cancelled") {
      return { ...progress, taskId };
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
}
