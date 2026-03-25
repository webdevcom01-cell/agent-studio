import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hybridSearch } from "@/lib/knowledge/search";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { agentId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

    const body = await request.json();

    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) {
      return NextResponse.json(
        { success: false, error: "Query is required" },
        { status: 400 }
      );
    }

    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { knowledgeBase: { select: { id: true } } },
    });

    if (!agent?.knowledgeBase) {
      return NextResponse.json(
        { success: false, error: "Knowledge base not found" },
        { status: 404 }
      );
    }

    const topK = Math.min(Math.max(Number(body.topK) || 5, 1), 20);
    const results = await hybridSearch(query, agent.knowledgeBase.id, {
      topK,
    });

    return NextResponse.json({ success: true, data: results });
  } catch (err) {
    logger.error("Knowledge search failed", err);
    return NextResponse.json(
      { success: false, error: "Search failed" },
      { status: 500 }
    );
  }
}
