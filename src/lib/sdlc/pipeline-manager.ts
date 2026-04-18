/**
 * SDLC Pipeline Manager — P5
 *
 * CRUD + lifecycle operations for PipelineRun records.
 * Worker integration (enqueueing, step progress) is handled by
 * src/lib/queue/index.ts and src/lib/queue/worker.ts.
 *
 * Status transitions:
 *   PENDING  → RUNNING   (worker picks up job)
 *   RUNNING  → COMPLETED (all steps finished)
 *   RUNNING  → FAILED    (unrecoverable error)
 *   any      → CANCELLED (user cancels; worker aborts between steps)
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { PipelineRunStatus, Prisma } from "@/generated/prisma";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PipelineRun {
  id: string;
  status: PipelineRunStatus;
  taskDescription: string;
  taskType: string;
  complexity: string;
  pipeline: string[];
  currentStep: number;
  stepResults: Record<string, string>;
  finalOutput: string | null;
  error: string | null;
  approvalFeedback: string | null;
  jobId: string | null;
  agentId: string;
  userId: string | null;
  repoUrl: string | null;
  prUrl: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePipelineRunInput {
  taskDescription: string;
  taskType: string;
  complexity: string;
  pipeline: string[];
  agentId: string;
  userId?: string;
  repoUrl?: string;
}

export interface ListPipelineRunsOptions {
  status?: PipelineRunStatus;
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toRun(row: {
  id: string;
  status: PipelineRunStatus;
  taskDescription: string;
  taskType: string;
  complexity: string;
  pipeline: string[];
  currentStep: number;
  stepResults: Prisma.JsonValue;
  finalOutput: string | null;
  error: string | null;
  approvalFeedback?: string | null;
  jobId: string | null;
  agentId: string;
  userId: string | null;
  repoUrl: string | null;
  prUrl: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): PipelineRun {
  return {
    ...row,
    approvalFeedback: row.approvalFeedback ?? null,
    repoUrl: row.repoUrl,
    prUrl: row.prUrl,
    stepResults:
      row.stepResults && typeof row.stepResults === "object" && !Array.isArray(row.stepResults)
        ? (row.stepResults as Record<string, string>)
        : {},
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createPipelineRun(
  input: CreatePipelineRunInput,
): Promise<PipelineRun> {
  const row = await prisma.pipelineRun.create({
    data: {
      taskDescription: input.taskDescription,
      taskType: input.taskType,
      complexity: input.complexity,
      pipeline: input.pipeline,
      agentId: input.agentId,
      userId: input.userId ?? null,
      repoUrl: input.repoUrl ?? null,
      status: "PENDING",
    },
  });

  logger.info("Pipeline run created", {
    runId: row.id,
    agentId: input.agentId,
    taskType: input.taskType,
    steps: input.pipeline.length,
  });

  return toRun(row);
}

export async function getPipelineRun(runId: string): Promise<PipelineRun | null> {
  const row = await prisma.pipelineRun.findUnique({
    where: { id: runId },
  });
  return row ? toRun(row) : null;
}

export async function listPipelineRuns(
  agentId: string,
  options: ListPipelineRunsOptions = {},
): Promise<{ runs: PipelineRun[]; total: number }> {
  const where: Prisma.PipelineRunWhereInput = {
    agentId,
    ...(options.status ? { status: options.status } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.pipelineRun.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(options.limit ?? 20, 100),
      skip: options.offset ?? 0,
    }),
    prisma.pipelineRun.count({ where }),
  ]);

  return { runs: rows.map(toRun), total };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** Called by worker when it picks up the job */
export async function markPipelineRunning(
  runId: string,
  jobId: string,
): Promise<PipelineRun> {
  const row = await prisma.pipelineRun.update({
    where: { id: runId },
    data: {
      status: "RUNNING",
      jobId,
      startedAt: new Date(),
      currentStep: 0,
    },
  });
  return toRun(row);
}

/** Called by worker after each step completes */
export async function advancePipelineStep(
  runId: string,
  stepIndex: number,
  stepOutput: string,
): Promise<PipelineRun> {
  // Atomic read-modify-write inside a transaction to prevent race conditions
  const row = await prisma.$transaction(async (tx) => {
    const current = await tx.pipelineRun.findUnique({
      where: { id: runId },
      select: { stepResults: true },
    });

    const existing =
      current?.stepResults &&
      typeof current.stepResults === "object" &&
      !Array.isArray(current.stepResults)
        ? (current.stepResults as Record<string, string>)
        : {};

    const updated = { ...existing, [String(stepIndex)]: stepOutput };

    return tx.pipelineRun.update({
      where: { id: runId },
      data: {
        currentStep: stepIndex + 1,
        stepResults: updated as Prisma.InputJsonValue,
      },
    });
  });

  logger.info("Pipeline step advanced", {
    runId,
    completedStep: stepIndex,
    nextStep: stepIndex + 1,
  });

  return toRun(row);
}

/** Called by worker on successful completion */
export async function markPipelineCompleted(
  runId: string,
  finalOutput: string,
  prUrl?: string,
): Promise<PipelineRun> {
  const row = await prisma.pipelineRun.update({
    where: { id: runId },
    data: {
      status: "COMPLETED",
      finalOutput,
      completedAt: new Date(),
      ...(prUrl ? { prUrl } : {}),
    },
  });

  logger.info("Pipeline run completed", { runId });

  return toRun(row);
}

/** Called by worker on unrecoverable error */
export async function markPipelineFailed(
  runId: string,
  error: string,
): Promise<PipelineRun> {
  const row = await prisma.pipelineRun.update({
    where: { id: runId },
    data: {
      status: "FAILED",
      error,
      completedAt: new Date(),
    },
  });

  logger.warn("Pipeline run failed", { runId, error });

  return toRun(row);
}

/** User cancels a pipeline run — worker checks this flag between steps.
 *  Idempotent: re-cancelling an already-cancelled run returns current state.
 *  Throws only if run not found or in a non-cancellable terminal state (COMPLETED/FAILED).
 */
export async function cancelPipelineRun(runId: string): Promise<PipelineRun> {
  const run = await prisma.pipelineRun.findUnique({
    where: { id: runId },
  });

  if (!run) throw new Error(`Pipeline run not found: ${runId}`);

  // Idempotent: already cancelled → return current state
  if (run.status === "CANCELLED") {
    logger.info("Pipeline run already cancelled (idempotent)", { runId });
    return toRun(run);
  }

  const nonCancellable: PipelineRunStatus[] = ["COMPLETED", "FAILED"];
  if (nonCancellable.includes(run.status)) {
    throw new Error(`Pipeline run already in terminal status: ${run.status}`);
  }

  const row = await prisma.pipelineRun.update({
    where: { id: runId },
    data: { status: "CANCELLED", completedAt: new Date() },
  });

  logger.info("Pipeline run cancelled", { runId });

  return toRun(row);
}

/** Check whether the pipeline run has been cancelled (worker calls this between steps) */
export async function isPipelineCancelled(runId: string): Promise<boolean> {
  const run = await prisma.pipelineRun.findUnique({
    where: { id: runId },
    select: { status: true },
  });
  return run?.status === "CANCELLED";
}

export async function markPipelineAwaitingApproval(
  runId: string,
): Promise<PipelineRun> {
  const row = await prisma.pipelineRun.update({
    where: { id: runId },
    data: { status: "AWAITING_APPROVAL" },
  });
  return toRun(row);
}

export async function approvePipelineRun(
  runId: string,
  feedback?: string,
): Promise<PipelineRun> {
  const run = await prisma.pipelineRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error(`Pipeline run not found: ${runId}`);
  if (run.status !== "AWAITING_APPROVAL") {
    throw new Error(
      `Pipeline run ${runId} is not awaiting approval (status: ${run.status})`,
    );
  }

  const row = await prisma.pipelineRun.update({
    where: { id: runId },
    data: {
      status: "PENDING",
      approvalFeedback: feedback ?? null,
    },
  });
  return toRun(row);
}

export async function isPipelineAwaitingApproval(runId: string): Promise<boolean> {
  const run = await prisma.pipelineRun.findUnique({
    where: { id: runId },
    select: { status: true },
  });
  return run?.status === "AWAITING_APPROVAL";
}
