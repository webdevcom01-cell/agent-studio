import { NextRequest, NextResponse } from "next/server";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import { getPipelineRun } from "@/lib/sdlc/pipeline-manager";

// ---------------------------------------------------------------------------
// GET /api/agents/[agentId]/pipelines/[runId] — Get pipeline run status
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string; runId: string }> },
) {
  const { agentId, runId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

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

    return NextResponse.json({ success: true, data: run });
  } catch (error) {
    logger.error("Failed to get pipeline run", { agentId, runId, error });
    return NextResponse.json(
      { success: false, error: "Failed to get pipeline run" },
      { status: 500 },
    );
  }
}
