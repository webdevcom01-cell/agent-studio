import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { prismaRead } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * Recent agent activity — latest executions across the caller's agents.
 * Scoped to agents owned by the user (or global). Read-only.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limitParam = Number(request.nextUrl.searchParams.get("limit") ?? "8");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 20) : 8;

  try {
    const ownAgents = await prismaRead.agent.findMany({
      where: { OR: [{ userId: auth.userId }, { userId: null }] },
      select: { id: true },
    });
    const agentIds = ownAgents.map((a) => a.id);

    const rows = await prismaRead.agentExecution.findMany({
      where: { agentId: { in: agentIds } },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        status: true,
        durationMs: true,
        createdAt: true,
        error: true,
        agent: { select: { name: true } },
      },
    });

    return NextResponse.json({
      items: rows.map((r) => ({
        id: r.id,
        agentName: r.agent?.name ?? "Agent",
        status: r.status,
        durationMs: r.durationMs,
        error: r.error,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    logger.error("GET /api/analytics/activity error", { error });
    return NextResponse.json({ success: false, error: "Failed to load activity" }, { status: 500 });
  }
}
