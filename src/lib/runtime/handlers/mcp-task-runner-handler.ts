import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
import { runTaskWithPolling } from "@/lib/mcp/task-client";
import { logger } from "@/lib/logger";

const DEFAULT_OUTPUT_VARIABLE = "task_result";
const DEFAULT_POLL_INTERVAL = 2000;
const DEFAULT_MAX_DURATION = 3_600_000;
const MAX_RETRIES = 3;

/**
 * mcp_task_runner — Runs long-running MCP tasks with progress polling and retry.
 */
export const mcpTaskRunnerHandler: NodeHandler = async (node, context) => {
  const mcpServerUrl = resolveTemplate(
    (node.data.mcpServerUrl as string) ?? "",
    context.variables,
  );
  const taskName = (node.data.taskName as string) ?? "";
  const inputMappingRaw = (node.data.inputMapping as { key: string; value: string }[]) ?? [];
  const pollIntervalMs =
    (node.data.pollIntervalMs as number) ??
    Number(process.env.MCP_TASK_POLL_INTERVAL_MS ?? DEFAULT_POLL_INTERVAL);
  const maxDurationMs =
    (node.data.maxDurationMs as number) ??
    Number(process.env.MCP_TASK_MAX_DURATION_MS ?? DEFAULT_MAX_DURATION);
  const retryOnFailure = (node.data.retryOnFailure as boolean) ?? true;
  const outputVariable =
    (node.data.outputVariable as string) || DEFAULT_OUTPUT_VARIABLE;

  if (!mcpServerUrl) {
    return {
      messages: [
        { role: "assistant", content: "MCP Task Runner has no server URL configured." },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  if (!taskName) {
    return {
      messages: [
        { role: "assistant", content: "MCP Task Runner has no task name configured." },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  const input: Record<string, unknown> = {};
  for (const { key, value } of inputMappingRaw) {
    input[key] = resolveTemplate(value, context.variables);
  }

  const maxAttempts = retryOnFailure ? MAX_RETRIES : 1;
  let lastError = "";
  const startTime = Date.now();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await runTaskWithPolling(mcpServerUrl, taskName, input, {
        pollIntervalMs,
        maxDurationMs,
      });

      const durationMs = Date.now() - startTime;

      if (result.status === "completed") {
        return {
          messages: [],
          nextNodeId: null,
          waitForInput: false,
          updatedVariables: {
            ...context.variables,
            [outputVariable]: {
              taskId: result.taskId,
              status: result.status,
              progress: result.progress,
              result: result.result,
              durationMs,
              retryCount: attempt - 1,
            },
          },
        };
      }

      if (result.status === "cancelled") {
        return {
          messages: [],
          nextNodeId: null,
          waitForInput: false,
          updatedVariables: {
            ...context.variables,
            [outputVariable]: {
              taskId: result.taskId,
              status: "cancelled",
              progress: result.progress,
              result: null,
              durationMs,
              retryCount: attempt - 1,
            },
          },
        };
      }

      lastError = result.error ?? "Task failed";
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    if (attempt < maxAttempts) {
      const backoff = 1000 * Math.pow(2, attempt - 1);
      logger.info("MCP task retry", {
        taskName,
        attempt,
        backoffMs: backoff,
      });
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }

  return {
    messages: [],
    nextNodeId: null,
    waitForInput: false,
    updatedVariables: {
      ...context.variables,
      [outputVariable]: {
        taskId: null,
        status: "failed",
        progress: 0,
        result: null,
        durationMs: Date.now() - startTime,
        retryCount: maxAttempts - 1,
        error: lastError,
      },
    },
  };
};
