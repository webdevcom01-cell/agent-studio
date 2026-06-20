import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { prisma, prismaRead } from "@/lib/prisma";
import { withOrgContext } from "@/lib/db/rls-middleware";
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
    const ownAgents = await withOrgContext(prisma, auth.organizationId, (tx) =>
      tx.agent.findMany({
        where: { OR: [{ userId: auth.userId }, { userId: null }] },
        select: { id: true, name: true },
      }),
    );
    const agentIds = ownAgents.map((a) => a.id);
    const nameById = new Map(ownAgents.map((a) => [a.id, a.name]));

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
        agentId: true,
      },
    });

    return NextResponse.json({
      items: rows.map((r) => ({
        id: r.id,
        agentName: nameById.get(r.agentId) ?? "Agent",
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
