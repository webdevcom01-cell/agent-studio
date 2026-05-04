import { NextRequest, NextResponse } from "next/server";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

const PAGE_SIZE = 50;

export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { agentId } = await params;

  const authResult = await requireAgentOwner(agentId, request);
  if (isAuthError(authResult)) return authResult;

  const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;

  try {
    const runs = await prisma.heartbeatRun.findMany({
      where: { agentId },
      orderBy: { startedAt: "desc" },
      take: PAGE_SIZE + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      select: {
        id: true,
        status: true,
        startedAt: true,
        completedAt: true,
        durationMs: true,
        error: true,
      },
    });

    const hasMore = runs.length > PAGE_SIZE;
    const page = hasMore ? runs.slice(0, PAGE_SIZE) : runs;
    const nextCursor = hasMore ? page[page.length - 1]?.id : undefined;

    return NextResponse.json({
      success: true,
      data: page,
      meta: { hasMore, nextCursor },
    });
  } catch (error) {
    logger.error("GET /api/agents/[agentId]/heartbeat/runs error", { agentId, error });
    return NextResponse.json({ success: false, error: "Failed to fetch heartbeat runs" }, { status: 500 });
  }
}
