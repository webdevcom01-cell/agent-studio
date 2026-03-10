import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteSourceChunks } from "@/lib/knowledge/ingest";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ agentId: string; sourceId: string }>;
}

export async function DELETE(
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
      },
    });
    if (!source) {
      return NextResponse.json(
        { success: false, error: "Source not found" },
        { status: 404 }
      );
    }

    await deleteSourceChunks(sourceId);
    await prisma.kBSource.delete({ where: { id: sourceId } });

    return NextResponse.json({ success: true, data: null });
  } catch (err) {
    logger.error("Failed to delete source", err);
    return NextResponse.json(
      { success: false, error: "Failed to delete source" },
      { status: 500 }
    );
  }
}
