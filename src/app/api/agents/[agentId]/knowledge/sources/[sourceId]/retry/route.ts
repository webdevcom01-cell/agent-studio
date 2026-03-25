import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ingestSource, deleteSourceChunks } from "@/lib/knowledge/ingest";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ agentId: string; sourceId: string }>;
}

export async function POST(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { agentId, sourceId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

    const source = await prisma.kBSource.findFirst({
      where: {
        id: sourceId,
        knowledgeBase: { agentId },
        status: "FAILED",
      },
    });

    if (!source) {
      return NextResponse.json(
        { success: false, error: "Source not found or not in FAILED state" },
        { status: 404 }
      );
    }

    // Clear old chunks and reset status to PENDING
    // Note: retryCount will be incremented by ingestSource itself
    await deleteSourceChunks(sourceId);
    await prisma.kBSource.update({
      where: { id: sourceId },
      data: {
        status: "PENDING",
        errorMsg: null,
        retryCount: 0, // reset so ingestSource's increment brings it to 1
      },
    });

    // Re-trigger background ingest
    ingestSource(sourceId).catch((err) => {
      logger.error("Retry ingest failed", err);
    });

    return NextResponse.json({ success: true, data: null });
  } catch (err) {
    logger.error("Failed to retry source", err);
    return NextResponse.json(
      { success: false, error: "Failed to retry source" },
      { status: 500 }
    );
  }
}
