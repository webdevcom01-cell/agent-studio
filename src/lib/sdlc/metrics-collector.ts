/**
 * metrics-collector.ts — Tier 4 G1/G2
 *
 * Per-step telemetry persistence and model performance aggregation.
 * All exported functions are fire-and-forget safe: they catch and log
 * errors internally and never throw toward the caller.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { Prisma } from "@/generated/prisma";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StepMetric {
  /** Step ID from the pipeline definition (e.g. "codegen", "run_tests") */
  stepId: string;
  /** StepPhase value for this step */
  phase: string;
  /** Model ID used for the AI call */
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  /** Total wall-clock time including any feedback loop iterations, in ms */
  durationMs: number;
  /** Number of feedback loop iterations that ran (0 = first try succeeded or no feedback loop) */
  feedbackAttempts: number;
  /**
   * success = step ultimately produced correct output (with or without retries)
   * retried = feedback loop exhausted MAX_RETRIES without fixing the problem
   */
  outcome: "success" | "retried";
}

// ---------------------------------------------------------------------------
// G1: Persist per-step metrics for a completed/partial run
// ---------------------------------------------------------------------------

export async function recordAllStepMetrics(
  runId: string,
  metrics: Record<number, StepMetric>,
): Promise<void> {
  if (Object.keys(metrics).length === 0) return;
  try {
    // Read existing metrics and merge — critical for retry runs that resume
    // from step N: pre-retry step metrics (0..N-1) must not be overwritten.
    const existing = await prisma.pipelineRun.findUnique({
      where: { id: runId },
      select: { stepMetrics: true },
    });
    const existingMap =
      existing?.stepMetrics &&
      typeof existing.stepMetrics === "object" &&
      !Array.isArray(existing.stepMetrics)
        ? (existing.stepMetrics as Record<string, unknown>)
        : {};
    const merged = { ...existingMap, ...metrics };

    await prisma.pipelineRun.update({
      where: { id: runId },
      data: { stepMetrics: merged as Prisma.InputJsonValue },
    });
    logger.info("metrics-collector: step metrics persisted (merged)", {
      runId,
      newStepCount:   Object.keys(metrics).length,
      totalStepCount: Object.keys(merged).length,
    });
  } catch (err) {
    logger.warn("metrics-collector: failed to persist step metrics", {
      runId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// G2: Aggregate step metrics into ModelPerformanceStat records
// ---------------------------------------------------------------------------

interface StatAccumulator {
  agentId: string;
  modelId: string;
  phase: string;
  runCount: number;
  successCount: number;
  retryCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalDurationMs: number;
}

export async function aggregateRunMetrics(runId: string): Promise<void> {
  try {
    const run = await prisma.pipelineRun.findUnique({
      where: { id: runId },
      select: { stepMetrics: true, agentId: true },
    });

    if (
      !run?.stepMetrics ||
      typeof run.stepMetrics !== "object" ||
      Array.isArray(run.stepMetrics)
    ) {
      return;
    }

    const metricsMap = run.stepMetrics as unknown as Record<string, StepMetric>;
    const entries = Object.values(metricsMap);
    if (entries.length === 0) return;

    const grouped = new Map<string, StatAccumulator>();

    for (const metric of entries) {
      if (metric.modelId === "none") continue;

      const key = `${run.agentId}::${metric.modelId}::${metric.phase}`;
      const existing = grouped.get(key) ?? {
        agentId: run.agentId,
        modelId: metric.modelId,
        phase: metric.phase,
        runCount: 0,
        successCount: 0,
        retryCount: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalDurationMs: 0,
      };

      existing.runCount++;
      if (metric.outcome === "success") existing.successCount++;
      existing.retryCount += metric.feedbackAttempts;
      existing.totalInputTokens += metric.inputTokens;
      existing.totalOutputTokens += metric.outputTokens;
      existing.totalDurationMs += metric.durationMs;

      grouped.set(key, existing);
    }

    await Promise.allSettled(
      Array.from(grouped.values()).map((stat) =>
        prisma.modelPerformanceStat.upsert({
          where: {
            agentId_modelId_phase: {
              agentId: stat.agentId,
              modelId: stat.modelId,
              phase: stat.phase,
            },
          },
          create: stat,
          update: {
            runCount:          { increment: stat.runCount },
            successCount:      { increment: stat.successCount },
            retryCount:        { increment: stat.retryCount },
            totalInputTokens:  { increment: stat.totalInputTokens },
            totalOutputTokens: { increment: stat.totalOutputTokens },
            totalDurationMs:   { increment: stat.totalDurationMs },
          },
        }),
      ),
    );

    logger.info("metrics-collector: model performance stats updated", {
      runId,
      modelsUpdated: grouped.size,
    });
  } catch (err) {
    logger.warn("metrics-collector: aggregation failed, skipping", {
      runId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Query helpers — used by the G5 metrics API route
// ---------------------------------------------------------------------------

export interface ModelStatRow {
  modelId: string;
  phase: string;
  runCount: number;
  successCount: number;
  retryCount: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  avgDurationMs: number;
  successRate: number;
}

export async function getModelStats(agentId: string, phase?: string): Promise<ModelStatRow[]> {
  const stats = await prisma.modelPerformanceStat.findMany({
    where: { agentId, ...(phase ? { phase } : {}) },
    orderBy: [{ phase: "asc" }, { runCount: "desc" }],
  });

  return stats.map((s) => ({
    modelId:         s.modelId,
    phase:           s.phase,
    runCount:        s.runCount,
    successCount:    s.successCount,
    retryCount:      s.retryCount,
    avgInputTokens:  s.runCount > 0 ? Math.round(s.totalInputTokens  / s.runCount) : 0,
    avgOutputTokens: s.runCount > 0 ? Math.round(s.totalOutputTokens / s.runCount) : 0,
    avgDurationMs:   s.runCount > 0 ? Math.round(s.totalDurationMs   / s.runCount) : 0,
    successRate:     s.runCount > 0 ? s.successCount / s.runCount : 0,
  }));
}

export interface PipelineSummary {
  total: number;
  completed: number;
  failed: number;
  cancelled: number;
  running: number;
  avgDurationMs: number;
  successRate: number;
}

export async function getPipelineSummary(agentId: string): Promise<PipelineSummary> {
  const [counts, completedRuns] = await Promise.all([
    // Single groupBy replaces 3+ separate COUNT queries
    prisma.pipelineRun.groupBy({
      by: ["status"],
      where: { agentId },
      _count: { id: true },
    }),
    prisma.pipelineRun.findMany({
      where: {
        agentId,
        status: "COMPLETED",
        startedAt: { not: null },
        completedAt: { not: null },
      },
      select: { startedAt: true, completedAt: true },
      take: 100,
      orderBy: { completedAt: "desc" },
    }),
  ]);

  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count.id]));
  const total     = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const completed = byStatus["COMPLETED"] ?? 0;
  const failed    = byStatus["FAILED"]    ?? 0;
  const cancelled = byStatus["CANCELLED"] ?? 0;
  const running   = (byStatus["RUNNING"] ?? 0) + (byStatus["PENDING"] ?? 0);

  const durations = completedRuns
    .map((r) => r.completedAt!.getTime() - r.startedAt!.getTime())
    .filter((d) => d > 0);

  const avgDurationMs =
    durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;

  return {
    total,
    completed,
    failed,
    cancelled,
    running,
    avgDurationMs,
    successRate: total > 0 ? completed / total : 0,
  };
}
