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
    await prisma.pipelineRun.update({
      where: { id: runId },
      data: { stepMetrics: metrics as Prisma.InputJsonValue },
    });
    logger.info("metrics-collector: step metrics persisted", {
      runId,
      stepCount: Object.keys(metrics).length,
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
      select: { stepMetrics: true },
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

      const key = `${metric.modelId}::${metric.phase}`;
      const existing = grouped.get(key) ?? {
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
            modelId_phase: { modelId: stat.modelId, phase: stat.phase },
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

export async function getModelStats(phase?: string): Promise<ModelStatRow[]> {
  const stats = await prisma.modelPerformanceStat.findMany({
    where: phase ? { phase } : undefined,
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
  avgDurationMs: number;
  successRate: number;
}

export async function getPipelineSummary(agentId: string): Promise<PipelineSummary> {
  const [total, completed, failed] = await Promise.all([
    prisma.pipelineRun.count({ where: { agentId } }),
    prisma.pipelineRun.count({ where: { agentId, status: "COMPLETED" } }),
    prisma.pipelineRun.count({ where: { agentId, status: "FAILED" } }),
  ]);

  const completedRuns = await prisma.pipelineRun.findMany({
    where: {
      agentId,
      status: "COMPLETED",
      startedAt: { not: null },
      completedAt: { not: null },
    },
    select: { startedAt: true, completedAt: true },
    take: 100,
    orderBy: { completedAt: "desc" },
  });

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
    avgDurationMs,
    successRate: total > 0 ? completed / total : 0,
  };
}
