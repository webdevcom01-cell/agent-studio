import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { prismaRead } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const PERIOD_HOURS: Record<string, number> = {
  "24h": 24,
  "7d": 168,
  "30d": 720,
  "90d": 2160,
};

/**
 * Dashboard KPI summary — lightweight aggregates over the caller's agents.
 * All numbers are computed from real data: AgentExecution, CostEvent,
 * HumanApprovalRequest. Scoped to agents owned by the user (or global).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const periodParam = request.nextUrl.searchParams.get("period") ?? "30d";
  const hours = PERIOD_HOURS[periodParam] ?? PERIOD_HOURS["30d"];
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  try {
    const ownAgents = await prismaRead.agent.findMany({
      where: { OR: [{ userId: auth.userId }, { userId: null }] },
      select: { id: true },
    });
    const agentIds = ownAgents.map((a) => a.id);

    const [runsTotal, runsSuccess, runsCompleted, spend, latency, openReviews] = await Promise.all([
      prismaRead.agentExecution.count({
        where: { agentId: { in: agentIds }, createdAt: { gte: since } },
      }),
      prismaRead.agentExecution.count({
        where: { agentId: { in: agentIds }, createdAt: { gte: since }, status: "SUCCESS" },
      }),
      prismaRead.agentExecution.count({
        where: { agentId: { in: agentIds }, createdAt: { gte: since }, status: { in: ["SUCCESS", "FAILED", "TIMEOUT"] } },
      }),
      prismaRead.costEvent.aggregate({
        _sum: { costUsd: true },
        where: { agentId: { in: agentIds }, createdAt: { gte: since } },
      }),
      prismaRead.agentExecution.aggregate({
        _avg: { durationMs: true },
        where: { agentId: { in: agentIds }, createdAt: { gte: since }, durationMs: { not: null } },
      }),
      prismaRead.humanApprovalRequest.count({
        where: { agentId: { in: agentIds }, status: "pending" },
      }),
    ]);

    return NextResponse.json({
      period: periodParam,
      activeAgents: agentIds.length,
      runs: runsTotal,
      successRate: runsCompleted > 0 ? Math.round((runsSuccess / runsCompleted) * 1000) / 10 : null,
      spendUsd: Number(spend._sum.costUsd ?? 0),
      avgLatencyMs: latency._avg.durationMs ?? null,
      openReviews,
    });
  } catch (error) {
    logger.error("GET /api/analytics/summary error", { error });
    return NextResponse.json({ success: false, error: "Failed to load summary" }, { status: 500 });
  }
}
