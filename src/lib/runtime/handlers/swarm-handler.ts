/**
 * swarm — Shared task pool with N workers pulling tasks dynamically.
 *
 * Unlike `parallel` (fixed branch assignment), swarm workers atomically claim
 * tasks from a shared queue. Each worker continues until the queue is empty.
 * Results are merged via configurable strategy (concat or summarize).
 *
 * B1 — Phase B, agent-studio
 */

import { generateText } from "ai";
import { getModel, getModelByTier, DEFAULT_MODEL } from "@/lib/ai";
import type { NodeHandler, OutputMessage } from "../types";
import { resolveTemplate } from "../template";
import { logger } from "@/lib/logger";

const MAX_WORKERS = 10;
const MAX_TASKS = 50;
const DEFAULT_WORKER_COUNT = 3;
const TASK_TIMEOUT_MS = 60_000; // 60s per task
const OVERALL_TIMEOUT_MS = 300_000; // 5 min overall

type TaskStatus = "pending" | "claimed" | "done" | "failed";

interface TaskItem {
  index: number;
  description: string;
  status: TaskStatus;
  claimedBy: number | null;
  result: string | null;
  error: string | null;
  durationMs: number | null;
}

/**
 * Atomic claim: find next pending task and mark as claimed.
 * Since Node.js is single-threaded between awaits, this is safe
 * as long as we don't yield between read and write.
 */
function claimNextTask(queue: TaskItem[], workerId: number): TaskItem | null {
  for (const task of queue) {
    if (task.status === "pending") {
      task.status = "claimed";
      task.claimedBy = workerId;
      return task;
    }
  }
  return null;
}

/**
 * Execute a single task using AI.
 */
async function executeTask(
  task: TaskItem,
  systemPrompt: string,
  model: ReturnType<typeof getModel>,
  taskContext: string,
): Promise<void> {
  const start = Date.now();
  try {
    const prompt = taskContext
      ? `Context:\n${taskContext}\n\nTask: ${task.description}`
      : task.description;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TASK_TIMEOUT_MS);

    try {
      const { text } = await generateText({
        model,
        system: systemPrompt,
        prompt,
        abortSignal: controller.signal,
      });

      task.result = text || "(empty response)";
      task.status = "done";
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    task.status = "failed";
    task.error =
      error instanceof Error ? error.message : "Unknown error";
  }
  task.durationMs = Date.now() - start;
}

/**
 * Worker loop: claim tasks and execute them until queue is empty or deadline.
 */
async function runWorker(
  workerId: number,
  queue: TaskItem[],
  systemPrompt: string,
  model: ReturnType<typeof getModel>,
  taskContext: string,
  deadline: number,
  messages: OutputMessage[],
): Promise<number> {
  let tasksCompleted = 0;

  while (Date.now() < deadline) {
    const task = claimNextTask(queue, workerId);
    if (!task) break; // No more pending tasks

    await executeTask(task, systemPrompt, model, taskContext);
    tasksCompleted++;

    if (task.status === "done") {
      messages.push({
        role: "assistant",
        content: `[Worker ${workerId}] Task ${task.index + 1}: ${task.result}`,
      });
    } else {
      messages.push({
        role: "assistant",
        content: `[Worker ${workerId}] Task ${task.index + 1} failed: ${task.error}`,
      });
    }
  }

  return tasksCompleted;
}

/**
 * Merge task results based on strategy.
 */
async function mergeResults(
  queue: TaskItem[],
  strategy: string,
  model: ReturnType<typeof getModel>,
): Promise<string> {
  const completed = queue.filter((t) => t.status === "done");

  if (completed.length === 0) {
    return "No tasks completed successfully.";
  }

  if (strategy === "summarize" && completed.length > 1) {
    try {
      const allResults = completed
        .map((t) => `Task ${t.index + 1} (${t.description}):\n${t.result}`)
        .join("\n\n---\n\n");

      const { text } = await generateText({
        model,
        prompt: `Synthesize these task results into a cohesive summary:\n\n${allResults}`,
      });

      return text || allResults;
    } catch {
      // Fall back to concat on summarize failure
      return completed
        .map((t) => `**Task ${t.index + 1}**: ${t.result}`)
        .join("\n\n");
    }
  }

  // Default: concat
  return completed
    .map((t) => `**Task ${t.index + 1}**: ${t.result}`)
    .join("\n\n");
}

export const swarmHandler: NodeHandler = async (node, context) => {
  const tasksRaw = node.data.tasks as string[] | string | undefined;
  const workerCount = Math.min(
    MAX_WORKERS,
    Math.max(1, (node.data.workerCount as number) ?? DEFAULT_WORKER_COUNT),
  );
  const workerModel = (node.data.workerModel as string) || undefined;
  const mergeStrategy = (node.data.mergeStrategy as string) ?? "concat";
  const systemPrompt = resolveTemplate(
    (node.data.systemPrompt as string) ?? "You are a helpful assistant completing assigned tasks.",
    context.variables,
  );
  const taskContext = resolveTemplate(
    (node.data.taskContext as string) ?? "",
    context.variables,
  );
  const outputVariable = (node.data.outputVariable as string) ?? "swarm_result";
  const tasksVariable = (node.data.tasksVariable as string) ?? "";

  try {
    // Parse task list from config or variable
    let taskList: string[] = [];

    if (tasksVariable && context.variables[tasksVariable]) {
      const fromVar = context.variables[tasksVariable];
      if (Array.isArray(fromVar)) {
        taskList = fromVar.map(String);
      } else if (typeof fromVar === "string") {
        taskList = fromVar.split("\n").filter((l) => l.trim().length > 0);
      }
    } else if (Array.isArray(tasksRaw)) {
      taskList = tasksRaw.filter((t) => t.trim().length > 0);
    } else if (typeof tasksRaw === "string") {
      taskList = tasksRaw.split("\n").filter((l) => l.trim().length > 0);
    }

    if (taskList.length === 0) {
      return {
        messages: [
          {
            role: "assistant",
            content:
              "Swarm node requires at least one task. Configure tasks in the property panel or provide a tasks variable.",
          },
        ],
        nextNodeId: null,
        waitForInput: false,
      };
    }

    // Cap at MAX_TASKS
    if (taskList.length > MAX_TASKS) {
      logger.warn("Swarm task list truncated", {
        nodeId: node.id,
        original: taskList.length,
        max: MAX_TASKS,
      });
      taskList = taskList.slice(0, MAX_TASKS);
    }

    // Build task queue
    const queue: TaskItem[] = taskList.map((desc, i) => ({
      index: i,
      description: desc.trim(),
      status: "pending",
      claimedBy: null,
      result: null,
      error: null,
      durationMs: null,
    }));

    // Resolve model — respect tier override and ecomode from cost_monitor
    const tierOverride = context.variables.__model_tier_override as
      | "fast"
      | "balanced"
      | "powerful"
      | undefined;
    const model = workerModel
      ? getModel(workerModel)
      : tierOverride
        ? getModelByTier(tierOverride)
        : getModel(DEFAULT_MODEL);

    const deadline = Date.now() + OVERALL_TIMEOUT_MS;
    const messages: OutputMessage[] = [];
    const effectiveWorkerCount = Math.min(workerCount, taskList.length);

    logger.info("Swarm starting", {
      nodeId: node.id,
      agentId: context.agentId,
      tasks: taskList.length,
      workers: effectiveWorkerCount,
      mergeStrategy,
    });

    // Launch workers concurrently
    const workerPromises = Array.from(
      { length: effectiveWorkerCount },
      (_, i) =>
        runWorker(i, queue, systemPrompt, model, taskContext, deadline, messages),
    );

    const workerResults = await Promise.allSettled(workerPromises);

    // Collect stats
    const completed = queue.filter((t) => t.status === "done").length;
    const failed = queue.filter((t) => t.status === "failed").length;
    const pending = queue.filter((t) => t.status === "pending").length;
    const totalDuration = queue
      .filter((t) => t.durationMs !== null)
      .reduce((sum, t) => sum + (t.durationMs ?? 0), 0);

    // Merge results
    const mergedOutput = await mergeResults(queue, mergeStrategy, model);

    // Route to done or failed sourceHandle
    const allSucceeded = failed === 0 && pending === 0;
    const nextEdge = context.flowContent.edges.find(
      (e) =>
        e.source === node.id &&
        e.sourceHandle === (allSucceeded ? "done" : "failed"),
    );
    const fallbackEdge = context.flowContent.edges.find(
      (e) =>
        e.source === node.id &&
        (e.sourceHandle === "done" || !e.sourceHandle),
    );

    const swarmResult = {
      totalTasks: taskList.length,
      completed,
      failed,
      pending,
      workers: effectiveWorkerCount,
      mergeStrategy,
      totalDurationMs: totalDuration,
      mergedOutput,
      tasks: queue.map((t) => ({
        index: t.index,
        description: t.description,
        status: t.status,
        claimedBy: t.claimedBy,
        result: t.result,
        error: t.error,
        durationMs: t.durationMs,
      })),
    };

    logger.info("Swarm completed", {
      nodeId: node.id,
      agentId: context.agentId,
      completed,
      failed,
      pending,
      totalDurationMs: totalDuration,
    });

    return {
      messages: [
        ...messages,
        {
          role: "assistant",
          content: `Swarm complete: ${completed}/${taskList.length} tasks done, ${failed} failed. Workers: ${effectiveWorkerCount}.`,
        },
      ],
      nextNodeId: (nextEdge ?? fallbackEdge)?.target ?? null,
      waitForInput: false,
      updatedVariables: {
        [outputVariable]: swarmResult,
        __swarm_merged: mergedOutput,
      },
    };
  } catch (error) {
    logger.error("swarm-handler error", { nodeId: node.id, error });
    return {
      messages: [
        {
          role: "assistant",
          content: "An error occurred in swarm node.",
        },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }
};
