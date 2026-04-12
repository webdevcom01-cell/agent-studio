import { NextRequest, NextResponse } from "next/server";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import { cancelPipelineRun, getPipelineRun } from "@/lib/sdlc/pipeline-manager";

// ---------------------------------------------------------------------------
// POST /api/agents/[agentId]/pipelines/[runId]/cancel — Cancel a pipeline run
// ---------------------------------------------------------------------------

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string; runId: string }> },
) {
  const { agentId, runId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  try {
    const existing = await getPipelineRun(runId);

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Pipeline run not found" },
        { status: 404 },
      );
    }

    if (existing.agentId !== agentId) {
      return NextResponse.json(
        { success: false, error: "Pipeline run not found" },
        { status: 404 },
      );
    }

    const run = await cancelPipelineRun(runId);

    logger.info("Pipeline run cancel requested", { agentId, runId });

    return NextResponse.json({ success: true, data: run });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";

    if (msg.includes("terminal status")) {
      return NextResponse.json(
        { success: false, error: msg },
        { status: 409 },
      );
    }

    logger.error("Failed to cancel pipeline run", { agentId, runId, error });
    return NextResponse.json(
      { success: false, error: "Failed to cancel pipeline run" },
      { status: 500 },
    );
  }
}
