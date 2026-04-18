import { type NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { getModelStats, getPipelineSummary } from "@/lib/sdlc/metrics-collector";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agentId = req.nextUrl.searchParams.get("agentId");
  const phase   = req.nextUrl.searchParams.get("phase") ?? undefined;

  if (!agentId) {
    return NextResponse.json(
      { success: false, error: "agentId query param is required" },
      { status: 400 },
    );
  }

  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  try {
    const [modelStats, pipelineSummary] = await Promise.all([
      getModelStats(phase),
      getPipelineSummary(agentId),
    ]);

    return NextResponse.json({
      success: true,
      data: { modelStats, pipelineSummary },
    });
  } catch (error) {
    logger.error("SDLC metrics fetch failed", { agentId, error });
    return NextResponse.json(
      { success: false, error: "Failed to fetch metrics" },
      { status: 500 },
    );
  }
}
