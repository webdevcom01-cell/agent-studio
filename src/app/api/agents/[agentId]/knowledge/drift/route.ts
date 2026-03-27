/**
 * GET /api/agents/[agentId]/knowledge/drift
 *
 * Detects embedding model drift in the knowledge base.
 * Returns drift status with recommendation (none/warn/reindex).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { sanitizeErrorMessage } from "@/lib/api/sanitize-error";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { detectEmbeddingDrift } from "@/lib/knowledge/embedding-drift";

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

export async function GET(
  _request: NextRequest,
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

    const drift = await detectEmbeddingDrift(kb.id);

    return NextResponse.json({ success: true, data: drift });
  } catch (error) {
    logger.error("Failed to detect embedding drift", error, { agentId });
    return NextResponse.json(
      { success: false, error: sanitizeErrorMessage(error) },
      { status: 500 }
    );
  }
}
