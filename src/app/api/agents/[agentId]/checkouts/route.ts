import { NextRequest, NextResponse } from "next/server";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { getAgentCheckouts } from "@/lib/tasks/atomic-checkout";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { agentId } = await params;

  const authResult = await requireAgentOwner(agentId, request);
  if (isAuthError(authResult)) return authResult;

  try {
    const checkouts = await getAgentCheckouts(agentId);
    return NextResponse.json({ success: true, data: checkouts });
  } catch (error) {
    logger.error("GET /api/agents/[agentId]/checkouts error", { agentId, error });
    return NextResponse.json({ success: false, error: "Failed to fetch checkouts" }, { status: 500 });
  }
}
