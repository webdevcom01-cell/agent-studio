/**
 * Managed Agent Tasks — P4
 *
 * CRUD + lifecycle operations for ManagedAgentTask records.
 * Worker integration (enqueueing, progress updates) is handled by
 * src/lib/queue/index.ts and src/lib/queue/worker.ts.
 *
 * Status transitions:
 *   PENDING → RUNNING   (worker picks up job)
 *   RUNNING → PAUSED    (user requests pause; worker honours between steps)
 *   PAUSED  → RUNNING   (user resumes; re-enqueued by worker)
 *   RUNNING → COMPLETED (task finished successfully)
 *   RUNNING → FAILED    (unrecoverable error)
 *   any     → CANCELLED (user cancels; worker aborts if in-flight)
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { ManagedTaskStatus, Prisma } from "@/generated/prisma";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaskInput {
  /** The task / instruction to run */
  task: string;
  /** Claude model ID */
  model?: string;
  /** Max tool-use steps */
  maxSteps?: number;
  /** Enable MCP tools */
  enableMCP?: boolean;
  /** Enable subagent tools */
  enableSubAgents?: boolean;
  /** Optional session ID for resume */
  sdkSessionId?: string;
  /** Output variable name in result JSON */
  outputVariable?: string;
}

export interface TaskOutput {
  result: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  sessionId?: string;
}

export interface ManagedTask {
  id: string;
  name: string;
  description: string | null;
  status: ManagedTaskStatus;
  jobId: string | null;
  input: TaskInput;
  output: TaskOutput | null;
  error: string | null;
  progress: number;
  callbackUrl: string | null;
  agentId: string;
  userId: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTaskInput {
  name: string;
  description?: string;
  agentId: string;
  userId?: string;
  input: TaskInput;
  callbackUrl?: string;
}

export interface ListTasksOptions {
  status?: ManagedTaskStatus;
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toTask(row: {
  id: string;
  name: string;
  description: string | null;
  status: ManagedTaskStatus;
  jobId: string | null;
  input: Prisma.JsonValue;
  output: Prisma.JsonValue;
  error: string | null;
  progress: number;
  callbackUrl: string | null;
  agentId: string;
  userId: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ManagedTask {
  return {
    ...row,
    input: row.input as unknown as TaskInput,
    output: row.output ? (row.output as unknown as TaskOutput) : null,
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createTask(input: CreateTaskInput): Promise<ManagedTask> {
  const row = await prisma.managedAgentTask.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      agentId: input.agentId,
      userId: input.userId ?? null,
      input: input.input as unknown as Prisma.InputJsonValue,
      callbackUrl: input.callbackUrl ?? null,
      status: "PENDING",
    },
  });

  logger.info("Managed task created", {
    taskId: row.id,
    agentId: input.agentId,
    name: input.name,
  });

  return toTask(row);
}

export async function getTask(taskId: string): Promise<ManagedTask | null> {
  const row = await prisma.managedAgentTask.findUnique({
    where: { id: taskId },
  });
  return row ? toTask(row) : null;
}

export async function listTasks(
  agentId: string,
  options: ListTasksOptions = {}
): Promise<{ tasks: ManagedTask[]; total: number }> {
  const where: Prisma.ManagedAgentTaskWhereInput = {
    agentId,
    ...(options.status ? { status: options.status } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.managedAgentTask.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(options.limit ?? 20, 100),
      skip: options.offset ?? 0,
    }),
    prisma.managedAgentTask.count({ where }),
  ]);

  return { tasks: rows.map(toTask), total };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** Called by worker when it picks up the job */
export async function markRunning(
  taskId: string,
  jobId: string
): Promise<ManagedTask> {
  const row = await prisma.managedAgentTask.update({
    where: { id: taskId },
    data: {
      status: "RUNNING",
      jobId,
      startedAt: new Date(),
      progress: 0,
    },
  });
  return toTask(row);
}

/** Called by worker on successful completion */
export async function markCompleted(
  taskId: string,
  output: TaskOutput
): Promise<ManagedTask> {
  const row = await prisma.managedAgentTask.update({
    where: { id: taskId },
    data: {
      status: "COMPLETED",
      output: output as unknown as Prisma.InputJsonValue,
      progress: 100,
      completedAt: new Date(),
    },
  });

  logger.info("Managed task completed", {
    taskId,
    durationMs: output.durationMs,
    inputTokens: output.inputTokens,
    outputTokens: output.outputTokens,
  });

  return toTask(row);
}

/** Called by worker on unrecoverable error */
export async function markFailed(
  taskId: string,
  error: string
): Promise<ManagedTask> {
  const row = await prisma.managedAgentTask.update({
    where: { id: taskId },
    data: {
      status: "FAILED",
      error,
      completedAt: new Date(),
    },
  });

  logger.warn("Managed task failed", { taskId, error });

  return toTask(row);
}

export async function markAbandoned(
  taskId: string,
  reason: string
): Promise<ManagedTask> {
  const row = await prisma.managedAgentTask.update({
    where: { id: taskId },
    data: {
      status: "ABANDONED",
      error: reason,
      completedAt: new Date(),
    },
  });

  logger.warn("Managed task abandoned", { taskId, reason });

  return toTask(row);
}

/** User requests pause — worker honours this between tool steps */
export async function requestPause(taskId: string): Promise<ManagedTask> {
  const task = await prisma.managedAgentTask.findUnique({
    where: { id: taskId },
    select: { status: true },
  });

  if (!task) throw new Error(`Task not found: ${taskId}`);
  if (task.status !== "RUNNING") {
    throw new Error(`Cannot pause task in status: ${task.status}`);
  }

  const row = await prisma.managedAgentTask.update({
    where: { id: taskId },
    data: { status: "PAUSED" },
  });

  logger.info("Managed task pause requested", { taskId });
  return toTask(row);
}

/** User resumes a paused task — caller is responsible for re-enqueueing */
export async function requestResume(taskId: string): Promise<ManagedTask> {
  const task = await prisma.managedAgentTask.findUnique({
    where: { id: taskId },
    select: { status: true },
  });

  if (!task) throw new Error(`Task not found: ${taskId}`);
  if (task.status !== "PAUSED") {
    throw new Error(`Cannot resume task in status: ${task.status}`);
  }

  const row = await prisma.managedAgentTask.update({
    where: { id: taskId },
    data: { status: "PENDING" },
  });

  logger.info("Managed task resume requested", { taskId });
  return toTask(row);
}

/** User cancels a task — worker checks this flag before each step */
export async function cancelTask(taskId: string): Promise<ManagedTask> {
  const task = await prisma.managedAgentTask.findUnique({
    where: { id: taskId },
    select: { status: true },
  });

  if (!task) throw new Error(`Task not found: ${taskId}`);

  const terminal: ManagedTaskStatus[] = ["COMPLETED", "FAILED", "CANCELLED"];
  if (terminal.includes(task.status)) {
    throw new Error(`Task already in terminal status: ${task.status}`);
  }

  const row = await prisma.managedAgentTask.update({
    where: { id: taskId },
    data: { status: "CANCELLED", completedAt: new Date() },
  });

  logger.info("Managed task cancelled", { taskId });
  return toTask(row);
}

/** Update progress (0–100) from worker */
export async function updateProgress(
  taskId: string,
  progress: number
): Promise<void> {
  await prisma.managedAgentTask.update({
    where: { id: taskId },
    data: { progress: Math.max(0, Math.min(100, progress)) },
  });
}

/** Check whether the task has been cancelled (worker calls this between steps) */
export async function isCancelled(taskId: string): Promise<boolean> {
  const task = await prisma.managedAgentTask.findUnique({
    where: { id: taskId },
    select: { status: true },
  });
  return task?.status === "CANCELLED";
}

/** Check whether the task has been paused (worker calls this between steps) */
export async function isPaused(taskId: string): Promise<boolean> {
  const task = await prisma.managedAgentTask.findUnique({
    where: { id: taskId },
    select: { status: true },
  });
  return task?.status === "PAUSED";
}
