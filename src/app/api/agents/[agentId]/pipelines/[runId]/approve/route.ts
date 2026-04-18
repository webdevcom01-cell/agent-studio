import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import { getPipelineRun, approvePipelineRun } from "@/lib/sdlc/pipeline-manager";
import { addPipelineRunJob } from "@/lib/queue";

const ApproveBodySchema = z.object({
  feedback: z.string().max(2000).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string; runId: string }> },
) {
  const { agentId, runId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  const body = await req.json();
  const parsed = ApproveBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.message },
      { status: 422 },
    );
  }

  try {
    const run = await approvePipelineRun(runId, parsed.data.feedback);

    const stepResultsMap = run.stepResults;
    const planningStepsCompleted = run.currentStep;

    await addPipelineRunJob({
      pipelineRunId: runId,
      agentId,
      userId: run.userId ?? undefined,
      startFromStep: planningStepsCompleted,
      existingStepResults: stepResultsMap,
      approvalFeedback: parsed.data.feedback,
      repoUrl: run.repoUrl ?? undefined,
    });

    logger.info("Pipeline run approved — Phase 2 job enqueued", {
      runId,
      agentId,
      planningStepsCompleted,
      hasFeedback: !!parsed.data.feedback,
    });

    return NextResponse.json({ success: true, data: { runId, status: run.status } });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const isInvalidStatus = errorMsg.includes("not awaiting approval");
    logger.error("Pipeline approve failed", { runId, agentId, error: err });
    return NextResponse.json(
      { success: false, error: isInvalidStatus ? errorMsg : "Failed to approve pipeline run" },
      { status: isInvalidStatus ? 409 : 500 },
    );
  }
}
