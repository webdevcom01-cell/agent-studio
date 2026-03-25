import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { generateAgentCard } from "@/lib/a2a/card-generator";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

export async function GET(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult;

    const { agentId } = await params;
    const baseUrl = new URL(req.url).origin;
    const card = await generateAgentCard(agentId, authResult.userId, baseUrl);

    return NextResponse.json({ success: true, data: card });
  } catch (err) {
    logger.error("Failed to generate agent card", err, {});
    return NextResponse.json(
      { success: false, error: "Agent not found" },
      { status: 404 }
    );
  }
}
