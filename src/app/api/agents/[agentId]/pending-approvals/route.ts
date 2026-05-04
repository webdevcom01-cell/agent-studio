import { NextRequest, NextResponse } from "next/server";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { agentId } = await params;

  const authResult = await requireAgentOwner(agentId, request);
  if (isAuthError(authResult)) return authResult;

  try {
    const decisions = await prisma.policyDecision.findMany({
      where: { agentId, status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: {
        policy: { select: { id: true, name: true, actionPattern: true, approverIds: true, timeoutSeconds: true } },
      },
    });
    return NextResponse.json({ success: true, data: decisions });
  } catch (error) {
    logger.error("GET /api/agents/[agentId]/pending-approvals error", { agentId, error });
    return NextResponse.json({ success: false, error: "Failed to fetch pending approvals" }, { status: 500 });
  }
}
