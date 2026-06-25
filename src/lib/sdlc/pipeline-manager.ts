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
import { withTenant, withAdminBypass } from "@/lib/api/tenant-context";
import { withOrgContext } from "@/lib/db/rls-middleware";
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
  modelId: string | null;
  useSmartRouting: boolean;
  requireApproval: boolean;
  jobId: string | null;
  agentId: string;
  userId: string | null;
  repoUrl: string | null;
  sourceRepoUrl: string | null;
  prUrl: string | null;
  webhookIdempotencyKey: string | null;
  webhookExecutionId: string | null;
  triggerSource: string;
  triggerBranch: string | null;
  triggerPrNumber: number | null;
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
  sourceRepoUrl?: string;
  modelId?: string;
  useSmartRouting?: boolean;
  requireApproval?: boolean;
  prUrl?: string;
  webhookIdempotencyKey?: string;
  webhookExecutionId?: string;
  triggerSource?: string;
  triggerBranch?: string;
  triggerPrNumber?: number;
  /**
   * Owning organization (for RLS tenant context). Derived from the caller's
   * auth/session (API) or the agent record (webhook ingress). Nullable for
   * legacy/personal agents without an org; null → RLS context skipped (safe).
   */
  organizationId: string | null;
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
  modelId?: string | null;
  useSmartRouting?: boolean;
  requireApproval?: boolean;
  jobId: string | null;
  agentId: string;
  userId: string | null;
  repoUrl: string | null;
  sourceRepoUrl?: string | null;
  prUrl: string | null;
  webhookIdempotencyKey?: string | null;
  webhookExecutionId?: string | null;
  triggerSource?: string;
  triggerBranch?: string | null;
  triggerPrNumber?: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): PipelineRun {
  return {
    ...row,
    approvalFeedback: row.approvalFeedback ?? null,
    modelId: row.modelId ?? null,
    useSmartRouting: row.useSmartRouting ?? false,
    requireApproval: row.requireApproval ?? false,
    repoUrl: row.repoUrl,
    sourceRepoUrl: row.sourceRepoUrl ?? null,
    prUrl: row.prUrl,
    webhookIdempotencyKey: row.webhookIdempotencyKey ?? null,
    webhookExecutionId: row.webhookExecutionId ?? null,
    triggerSource: row.triggerSource ?? "manual",
    triggerBranch: row.triggerBranch ?? null,
    triggerPrNumber: row.triggerPrNumber ?? null,
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
  const row = await withOrgContext(prisma, input.organizationId, (tx) =>
    tx.pipelineRun.create({
      data: {
        taskDescription: input.taskDescription,
        taskType: input.taskType,
        complexity: input.complexity,
        pipeline: input.pipeline,
        agentId: input.agentId,
        userId: input.userId ?? null,
        repoUrl: input.repoUrl ?? null,
        sourceRepoUrl: input.sourceRepoUrl,
        status: "PENDING",
        modelId: input.modelId ?? null,
        useSmartRouting: input.useSmartRouting ?? false,
        requireApproval: input.requireApproval ?? false,
        prUrl: input.prUrl ?? null,
        webhookIdempotencyKey: input.webhookIdempotencyKey ?? null,
        webhookExecutionId: input.webhookExecutionId ?? null,
        triggerSource: input.triggerSource ?? "manual",
        triggerBranch: input.triggerBranch ?? null,
        triggerPrNumber: input.triggerPrNumber ?? null,
      },
    }),
  );

  logger.info("Pipeline run created", {
    runId: row.id,
    agentId: input.agentId,
    taskType: input.taskType,
    steps: input.pipeline.length,
  });

  return toRun(row);
}

export async function getPipelineRun(
  runId: string,
  organizationId: string | null = null,
): Promise<PipelineRun | null> {
  const row = await withOrgContext(prisma, organizationId, (tx) =>
    tx.pipelineRun.findUnique({
      where: { id: runId },
    }),
  );
  return row ? toRun(row) : null;
}

/**
 * Field selection for list queries — excludes heavy JSON blobs that are only
 * needed when viewing a single run's details. stepResults (~28 KB/run) and
 * finalOutput (~15 KB/run) are fetched per-run via GET /[runId], so including
 * them in list responses wastes ~1 MB of bandwidth for a 20-run page.
 */
const SELECT_LIST_FIELDS = {
  id: true,
  status: true,
  taskDescription: true,
  taskType: true,
  complexity: true,
  pipeline: true,
  currentStep: true,
  stepMetrics: true,
  error: true,
  prUrl: true,
  approvalFeedback: true,
  modelId: true,
  useSmartRouting: true,
  requireApproval: true,
  jobId: true,
  agentId: true,
  userId: true,
  repoUrl: true,
  sourceRepoUrl: true,
  webhookIdempotencyKey: true,
  triggerSource: true,
  triggerBranch: true,
  triggerPrNumber: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  // stepResults and finalOutput intentionally omitted — fetched per-run only
} as const;

export async function listPipelineRuns(
  agentId: string,
  options: ListPipelineRunsOptions = {},
  organizationId: string | null = null,
): Promise<{ runs: PipelineRun[]; total: number }> {
  const where: Prisma.PipelineRunWhereInput = {
    agentId,
    ...(options.status ? { status: options.status } : {}),
  };

  const [rows, total] = await withOrgContext(prisma, organizationId, (tx) =>
    Promise.all([
      tx.pipelineRun.findMany({
        where,
        select: SELECT_LIST_FIELDS,
        orderBy: { createdAt: "desc" },
        take: Math.min(options.limit ?? 20, 100),
        skip: options.offset ?? 0,
      }),
      tx.pipelineRun.count({ where }),
    ]),
  );

  return {
    runs: rows.map((row) =>
      toRun({
        ...row,
        stepResults: {},     // not fetched in list — UI loads per-run
        finalOutput: null,   // not fetched in list — UI loads per-run
      }),
    ),
    total,
  };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** Called by worker when it picks up the job */
export async function markPipelineRunning(
  runId: string,
  jobId: string,
  startFromStep = 0,
): Promise<PipelineRun> {
  const row = await prisma.pipelineRun.update({
    where: { id: runId },
    data: {
      status: "RUNNING",
      jobId,
      startedAt: new Date(),
      currentStep: startFromStep,
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
  const row = await withTenant(async (tx) => {
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


/**
 * Saves a step's output to stepResults WITHOUT advancing currentStep.
 *
 * Use this for gate BLOCK decisions — the reviewer's output is persisted
 * so the UI can display the full report, but currentStep stays at the gate's
 * index so retry can restart from the correct position (last implementation
 * step before the gate, per retry route logic).
 *
 * Contrast with advancePipelineStep which does both: save output AND advance.
 */
export async function saveStepOutput(
  runId: string,
  stepIndex: number,
  stepOutput: string,
): Promise<void> {
  await withTenant(async (tx) => {
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
    await tx.pipelineRun.update({
      where: { id: runId },
      data: {
        stepResults: {
          ...existing,
          [String(stepIndex)]: stepOutput,
        } as Prisma.InputJsonValue,
        // NOTE: currentStep intentionally NOT updated here
      },
    });
  });

  logger.info("Pipeline step output saved (currentStep unchanged)", {
    runId,
    stepIndex,
  });
}

/** Called by worker on successful completion */
export async function markPipelineCompleted(
  runId: string,
  finalOutput: string,
  prUrl?: string,
  gitError?: string,
): Promise<PipelineRun> {
  // Append git failure notice to finalOutput so it is visible in the UI.
  // Git integration is best-effort — the pipeline COMPLETES even if git fails.
  const outputWithGitStatus = gitError
    ? `${finalOutput}\n\n---\n\n## ⚠️ Git Integration Failed\n\n${gitError}\n\nThe pipeline completed successfully but no pull request was created. Check your \`GITHUB_TOKEN\` (GitHub) or \`GITLAB_TOKEN\` (GitLab) configuration.`
    : finalOutput;

  const row = await prisma.pipelineRun.update({
    where: { id: runId },
    data: {
      status: "COMPLETED",
      finalOutput: outputWithGitStatus,
      completedAt: new Date(),
      ...(prUrl ? { prUrl } : {}),
    },
  });

  if (gitError) {
    logger.warn("Pipeline completed with git integration failure", { runId, gitError });
  } else {
    logger.info("Pipeline run completed", { runId });
  }

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
export async function cancelPipelineRun(
  runId: string,
  organizationId: string | null,
): Promise<PipelineRun> {
  const run = await withOrgContext(prisma, organizationId, (tx) =>
    tx.pipelineRun.findUnique({
      where: { id: runId },
    }),
  );

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

  const row = await withOrgContext(prisma, organizationId, (tx) =>
    tx.pipelineRun.update({
      where: { id: runId },
      data: { status: "CANCELLED", completedAt: new Date() },
    }),
  );

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
  organizationId: string | null = null,
): Promise<PipelineRun> {
  const run = await withOrgContext(prisma, organizationId, (tx) =>
    tx.pipelineRun.findUnique({ where: { id: runId } }),
  );
  if (!run) throw new Error(`Pipeline run not found: ${runId}`);
  if (run.status !== "AWAITING_APPROVAL") {
    throw new Error(
      `Pipeline run ${runId} is not awaiting approval (status: ${run.status})`,
    );
  }

  const row = await withOrgContext(prisma, organizationId, (tx) =>
    tx.pipelineRun.update({
      where: { id: runId },
      data: {
        status: "PENDING",
        approvalFeedback: feedback ?? null,
      },
    }),
  );
  return toRun(row);
}

export async function isPipelineAwaitingApproval(
  runId: string,
  organizationId: string | null = null,
): Promise<boolean> {
  const run = await withOrgContext(prisma, organizationId, (tx) =>
    tx.pipelineRun.findUnique({
      where: { id: runId },
      select: { status: true },
    }),
  );
  return run?.status === "AWAITING_APPROVAL";
}

export async function detectAndResetStalePipelineRuns(
  staleThresholdMinutes = 45,
  dryRun = false,
): Promise<{ resetCount: number; runIds: string[] }> {
  const cutoff = new Date(Date.now() - staleThresholdMinutes * 60 * 1000);

  // Cross-tenant system sweep (cron + worker): intentionally spans all orgs,
  // so it runs on the admin (BYPASSRLS) client rather than a single org context.
  const staleRuns = await withAdminBypass((db) =>
    db.pipelineRun.findMany({
      where: {
        status: "RUNNING",
        startedAt: { lt: cutoff },
      },
      select: { id: true, startedAt: true, currentStep: true, agentId: true, pipeline: true },
    }),
  );

  const runIds = staleRuns.map((r) => r.id);

  if (dryRun || staleRuns.length === 0) {
    if (staleRuns.length > 0) {
      logger.warn("detectAndResetStalePipelineRuns dryRun: stale runs detected", {
        count: staleRuns.length,
        runIds,
        staleThresholdMinutes,
      });
    }
    return { resetCount: staleRuns.length, runIds };
  }

  await withAdminBypass((db) =>
    db.pipelineRun.updateMany({
      where: { id: { in: runIds } },
      data: {
        status: "FAILED",
        error: `Pipeline stalled — worker process was killed mid-execution (detected after ${staleThresholdMinutes} min). Check currentStep for progress before interruption. This is typically caused by a Railway container restart or OOM kill, not a code error.`,
      },
    }),
  );

  for (const run of staleRuns) {
    const stuckMinutes = run.startedAt
      ? Math.round((Date.now() - run.startedAt.getTime()) / 60_000)
      : staleThresholdMinutes;
    logger.warn("Stale pipeline run reset to FAILED", {
      runId: run.id,
      agentId: run.agentId,
      stuckMinutes,
      currentStep: run.currentStep,
      totalSteps: (run.pipeline as string[]).length,
    });
  }

  return { resetCount: staleRuns.length, runIds };
}

// ─── Stuck-run utilities ──────────────────────────────────────────────────────

/**
 * Runs inactive longer than this are considered stuck.
 * Must be consistent with the UI threshold in page.tsx.
 */
export const PIPELINE_STUCK_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Returns true if a RUNNING pipeline run has not written to the DB
 * in more than PIPELINE_STUCK_THRESHOLD_MS milliseconds.
 *
 * Uses `updatedAt` (last Prisma write), NOT `startedAt` (pipeline begin).
 * `advancePipelineStep` and `saveStepOutput` both trigger Prisma's auto updatedAt,
 * so this accurately reflects whether the run is making progress.
 * A pipeline actively working will always have a recent updatedAt even if
 * startedAt was hours ago.
 */
export function isRunStuck(run: { status: string; updatedAt: Date }): boolean {
  if (run.status !== "RUNNING") return false;
  return Date.now() - run.updatedAt.getTime() > PIPELINE_STUCK_THRESHOLD_MS;
}

/**
 * Force-resets a stuck RUNNING pipeline run to FAILED so it can be re-enqueued
 * via the retry route with forceResume: true.
 */
export async function forceResetStuckRun(
  runId: string,
  organizationId: string | null = null,
): Promise<void> {
  await withOrgContext(prisma, organizationId, (tx) =>
    tx.pipelineRun.update({
      where: { id: runId },
      data: {
        status: "FAILED",
        error:
          "Run was stuck (no DB progress detected for over 10 minutes) and was force-reset. " +
          "The pipeline will resume from the last completed step.",
        completedAt: new Date(),
      },
    }),
  );
  logger.warn("Stuck pipeline run force-reset to FAILED", { runId });
}
