import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { Prisma } from "@/generated/prisma";

const PERIOD_MAP: Record<string, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

interface TopAgentRow {
  agentId: string;
  agentName: string;
  callCount: bigint;
}

interface RecentFailureRow {
  taskId: string;
  callerName: string;
  calleeName: string | null;
  externalUrl: string | null;
  errorMessage: string | null;
  createdAt: Date;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult;

    const userId = authResult.userId;
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") ?? "24h";
    const periodMs = PERIOD_MAP[period] ?? PERIOD_MAP["24h"];
    const since = new Date(Date.now() - periodMs);

    const userAgentFilter = {
      callerAgent: { userId },
      createdAt: { gte: since },
    };

    const [
      totalCalls,
      aggregates,
      statusBreakdown,
      topCallerAgents,
      topCalleeAgents,
      recentFailures,
    ] = await Promise.all([
      prisma.agentCallLog.count({ where: userAgentFilter }),
      prisma.agentCallLog.aggregate({
        _avg: { durationMs: true },
        _sum: { tokensUsed: true, estimatedCostUsd: true },
        where: userAgentFilter,
      }),
      prisma.agentCallLog.groupBy({
        by: ["status"],
        _count: true,
        where: userAgentFilter,
      }),
      prisma.$queryRaw<TopAgentRow[]>(Prisma.sql`
        SELECT
          l."callerAgentId" AS "agentId",
          a."name" AS "agentName",
          COUNT(*)::bigint AS "callCount"
        FROM "AgentCallLog" l
        INNER JOIN "Agent" a ON a."id" = l."callerAgentId"
        WHERE a."userId" = ${userId}
          AND l."createdAt" >= ${since}
        GROUP BY l."callerAgentId", a."name"
        ORDER BY "callCount" DESC
        LIMIT 5
      `),
      prisma.$queryRaw<TopAgentRow[]>(Prisma.sql`
        SELECT
          l."calleeAgentId" AS "agentId",
          a."name" AS "agentName",
          COUNT(*)::bigint AS "callCount"
        FROM "AgentCallLog" l
        INNER JOIN "Agent" ca ON ca."id" = l."callerAgentId"
        INNER JOIN "Agent" a ON a."id" = l."calleeAgentId"
        WHERE ca."userId" = ${userId}
          AND l."createdAt" >= ${since}
          AND l."calleeAgentId" IS NOT NULL
        GROUP BY l."calleeAgentId", a."name"
        ORDER BY "callCount" DESC
        LIMIT 5
      `),
      prisma.$queryRaw<RecentFailureRow[]>(Prisma.sql`
        SELECT
          l."taskId",
          ca."name" AS "callerName",
          ta."name" AS "calleeName",
          l."externalUrl",
          l."errorMessage",
          l."createdAt"
        FROM "AgentCallLog" l
        INNER JOIN "Agent" ca ON ca."id" = l."callerAgentId"
        LEFT JOIN "Agent" ta ON ta."id" = l."calleeAgentId"
        WHERE ca."userId" = ${userId}
          AND l."createdAt" >= ${since}
          AND l."status" = 'FAILED'
        ORDER BY l."createdAt" DESC
        LIMIT 5
      `),
    ]);

    const completed = statusBreakdown.find((s) => s.status === "COMPLETED")?._count ?? 0;
    const successRate = totalCalls > 0 ? Math.round((completed / totalCalls) * 100) / 100 : 0;

    return NextResponse.json({
      success: true,
      data: {
        period,
        totalCalls,
        successRate,
        avgDurationMs: Math.round(aggregates._avg.durationMs ?? 0),
        totalTokensUsed: aggregates._sum.tokensUsed ?? 0,
        estimatedTotalCost: Number(aggregates._sum.estimatedCostUsd ?? 0),
        topCallerAgents: topCallerAgents.map((r) => ({
          agentId: r.agentId,
          name: r.agentName,
          callCount: Number(r.callCount),
        })),
        topCalleeAgents: topCalleeAgents.map((r) => ({
          agentId: r.agentId,
          name: r.agentName,
          callCount: Number(r.callCount),
        })),
        recentFailures: recentFailures.map((r) => ({
          taskId: r.taskId,
          callerName: r.callerName,
          calleeName: r.calleeName ?? r.externalUrl ?? "unknown",
          error: r.errorMessage ?? "Unknown error",
          createdAt: r.createdAt,
        })),
      },
    });
  } catch (err) {
    logger.error("Failed to get agent call stats", err);
    return NextResponse.json(
      { success: false, error: "Failed to get stats" },
      { status: 500 }
    );
  }
}
