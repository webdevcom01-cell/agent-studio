/**
 * GET /api/agents/[agentId]/knowledge/analytics
 *
 * Returns Knowledge Base analytics: source stats, chunk distribution,
 * search metrics, embedding drift, top retrieved chunks.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { sanitizeErrorMessage } from "@/lib/api/sanitize-error";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getKBAnalytics } from "@/lib/knowledge/analytics";

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { agentId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  try {
    const kb = await prisma.knowledgeBase.findFirst({
      where: { agentId },
      select: { id: true },
    });

    if (!kb) {
      return NextResponse.json(
        { success: false, error: "Knowledge base not found" },
        { status: 404 }
      );
    }

    const analytics = await getKBAnalytics(kb.id);

    return NextResponse.json({ success: true, data: analytics });
  } catch (error) {
    logger.error("Failed to get KB analytics", error, { agentId });
    return NextResponse.json(
      { success: false, error: sanitizeErrorMessage(error) },
      { status: 500 }
    );
  }
}
