import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import { getPipelineRun } from "@/lib/sdlc/pipeline-manager";
import { addPipelineRunJob } from "@/lib/queue";
import { prisma } from "@/lib/prisma";

const RetryBodySchema = z.object({
  modelId: z.string().optional(),
  useSmartRouting: z.boolean().default(false),
});

/**
 * POST /api/agents/[agentId]/pipelines/[runId]/retry
 *
 * Re-enqueues a FAILED pipeline run from its last completed step.
 * Useful when a run was killed by a Railway container restart (stale run),
 * not due to a code error. Reads currentStep and stepResults from DB —
 * no need to re-run completed steps.
 *
 * Only FAILED runs can be retried. CANCELLED, COMPLETED, RUNNING, and
 * AWAITING_APPROVAL runs return 409.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string; runId: string }> },
) {
  const { agentId, runId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  const body = await req.json().catch(() => ({}));
  const parsed = RetryBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.message },
      { status: 422 },
    );
  }

  const { modelId, useSmartRouting } = parsed.data;

  try {
    const run = await getPipelineRun(runId);

    if (!run) {
      return NextResponse.json(
        { success: false, error: "Pipeline run not found" },
        { status: 404 },
      );
    }

    if (run.agentId !== agentId) {
      return NextResponse.json(
        { success: false, error: "Pipeline run not found" },
        { status: 404 },
      );
    }

    if (run.status !== "FAILED") {
      return NextResponse.json(
        {
          success: false,
          error: `Pipeline run cannot be retried (status: ${run.status}). Only FAILED runs can be retried.`,
        },
        { status: 409 },
      );
    }

    // Enqueue FIRST — if this throws, run stays FAILED (correct, user can retry again).
    // Only update DB status after job is safely in the queue.
    const jobId = await addPipelineRunJob({
      pipelineRunId: runId,
      agentId,
      userId: run.userId ?? undefined,
      modelId,
      useSmartRouting,
      startFromStep: run.currentStep,
      existingStepResults: run.stepResults,
      repoUrl: run.repoUrl ?? undefined,
      sourceRepoUrl: run.sourceRepoUrl ?? undefined,
    });

    await prisma.pipelineRun.update({
      where: { id: runId },
      data: {
        status: "PENDING",
        error: null,
        jobId,
      },
    });

    logger.info("Pipeline run retry enqueued", {
      runId,
      agentId,
      resumingFromStep: run.currentStep,
      totalSteps: run.pipeline.length,
      jobId,
    });

    return NextResponse.json({
      success: true,
      data: {
        runId,
        status: "PENDING",
        resumingFromStep: run.currentStep,
        totalSteps: run.pipeline.length,
      },
    });
  } catch (err) {
    logger.error("Pipeline retry failed", { runId, agentId, error: err });
    return NextResponse.json(
      { success: false, error: "Failed to retry pipeline run" },
      { status: 500 },
    );
  }
}
