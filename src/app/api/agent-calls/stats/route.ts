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

// ─── Row Types ──────────────────────────────────────────────────────────────

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

interface TimeSeriesRow {
  bucket: string;
  call_count: bigint;
  success_count: bigint;
  fail_count: bigint;
  avg_duration_ms: number;
}

interface LatencyBucketRow {
  bucket_label: string;
  bucket_order: number;
  count: bigint;
}

interface AgentPairRow {
  caller_id: string;
  caller_name: string;
  callee_id: string | null;
  callee_name: string | null;
  call_count: bigint;
  success_count: bigint;
  avg_duration_ms: number;
  total_tokens: bigint;
  total_cost: number;
}

interface PercentileRow {
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  max_ms: number;
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

    // Use hourly buckets for 1h/24h, daily for 7d
    const bucketExpr = period === "7d"
      ? Prisma.sql`DATE(l."createdAt")::text`
      : Prisma.sql`TO_CHAR(l."createdAt", 'YYYY-MM-DD HH24:00')`;

    const [
      totalCalls,
      aggregates,
      statusBreakdown,
      topCallerAgents,
      topCalleeAgents,
      recentFailures,
      timeSeries,
      latencyBuckets,
      agentPairs,
      percentiles,
    ] = await Promise.all([
      // 1. Total calls
      prisma.agentCallLog.count({ where: userAgentFilter }),

      // 2. Aggregates
      prisma.agentCallLog.aggregate({
        _avg: { durationMs: true },
        _sum: { tokensUsed: true, estimatedCostUsd: true },
        where: userAgentFilter,
      }),

      // 3. Status breakdown
      prisma.agentCallLog.groupBy({
        by: ["status"],
        _count: true,
        where: userAgentFilter,
      }),

      // 4. Top callers
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

      // 5. Top callees
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

      // 6. Recent failures
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
        LIMIT 10
      `),

      // 7. Time series (call volume + success/fail over time)
      prisma.$queryRaw<TimeSeriesRow[]>(Prisma.sql`
        SELECT
          ${bucketExpr} AS bucket,
          COUNT(*)::bigint AS call_count,
          SUM(CASE WHEN l."status" = 'COMPLETED' THEN 1 ELSE 0 END)::bigint AS success_count,
          SUM(CASE WHEN l."status" = 'FAILED' THEN 1 ELSE 0 END)::bigint AS fail_count,
          AVG(l."durationMs")::float AS avg_duration_ms
        FROM "AgentCallLog" l
        INNER JOIN "Agent" a ON a."id" = l."callerAgentId"
        WHERE a."userId" = ${userId}
          AND l."createdAt" >= ${since}
        GROUP BY ${bucketExpr}
        ORDER BY bucket ASC
      `),

      // 8. Latency distribution buckets
      prisma.$queryRaw<LatencyBucketRow[]>(Prisma.sql`
        SELECT bucket_label, bucket_order, COUNT(*)::bigint AS count
        FROM (
          SELECT
            CASE
              WHEN l."durationMs" IS NULL THEN 'Unknown'
              WHEN l."durationMs" < 100 THEN '<100ms'
              WHEN l."durationMs" < 500 THEN '100-500ms'
              WHEN l."durationMs" < 1000 THEN '500ms-1s'
              WHEN l."durationMs" < 3000 THEN '1-3s'
              WHEN l."durationMs" < 10000 THEN '3-10s'
              ELSE '>10s'
            END AS bucket_label,
            CASE
              WHEN l."durationMs" IS NULL THEN 99
              WHEN l."durationMs" < 100 THEN 0
              WHEN l."durationMs" < 500 THEN 1
              WHEN l."durationMs" < 1000 THEN 2
              WHEN l."durationMs" < 3000 THEN 3
              WHEN l."durationMs" < 10000 THEN 4
              ELSE 5
            END AS bucket_order
          FROM "AgentCallLog" l
          INNER JOIN "Agent" a ON a."id" = l."callerAgentId"
          WHERE a."userId" = ${userId}
            AND l."createdAt" >= ${since}
        ) buckets
        GROUP BY bucket_label, bucket_order
        ORDER BY bucket_order ASC
      `),

      // 9. Agent pair breakdown (caller → callee with metrics)
      prisma.$queryRaw<AgentPairRow[]>(Prisma.sql`
        SELECT
          l."callerAgentId" AS caller_id,
          ca."name" AS caller_name,
          l."calleeAgentId" AS callee_id,
          ta."name" AS callee_name,
          COUNT(*)::bigint AS call_count,
          SUM(CASE WHEN l."status" = 'COMPLETED' THEN 1 ELSE 0 END)::bigint AS success_count,
          AVG(l."durationMs")::float AS avg_duration_ms,
          COALESCE(SUM(l."tokensUsed"), 0)::bigint AS total_tokens,
          COALESCE(SUM(l."estimatedCostUsd"::numeric), 0)::float AS total_cost
        FROM "AgentCallLog" l
        INNER JOIN "Agent" ca ON ca."id" = l."callerAgentId"
        LEFT JOIN "Agent" ta ON ta."id" = l."calleeAgentId"
        WHERE ca."userId" = ${userId}
          AND l."createdAt" >= ${since}
        GROUP BY l."callerAgentId", ca."name", l."calleeAgentId", ta."name"
        ORDER BY call_count DESC
        LIMIT 15
      `),

      // 10. Latency percentiles
      prisma.$queryRaw<PercentileRow[]>(Prisma.sql`
        SELECT
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY l."durationMs")::float AS p50_ms,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY l."durationMs")::float AS p95_ms,
          PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY l."durationMs")::float AS p99_ms,
          MAX(l."durationMs")::float AS max_ms
        FROM "AgentCallLog" l
        INNER JOIN "Agent" a ON a."id" = l."callerAgentId"
        WHERE a."userId" = ${userId}
          AND l."createdAt" >= ${since}
          AND l."durationMs" IS NOT NULL
      `),
    ]);

    const completed = statusBreakdown.find((s) => s.status === "COMPLETED")?._count ?? 0;
    const successRate = totalCalls > 0 ? Math.round((completed / totalCalls) * 100) / 100 : 0;

    const statusMap: Record<string, number> = {};
    for (const s of statusBreakdown) {
      statusMap[s.status] = s._count;
    }

    const pctRow = percentiles[0];

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
        // ─── Phase 2 additions ────────────────────────────────────────
        statusBreakdown: statusMap,
        timeSeries: timeSeries.map((r) => ({
          bucket: r.bucket,
          callCount: Number(r.call_count),
          successCount: Number(r.success_count),
          failCount: Number(r.fail_count),
          avgDurationMs: Math.round(r.avg_duration_ms ?? 0),
        })),
        latencyDistribution: latencyBuckets
          .filter((r) => r.bucket_label !== "Unknown")
          .map((r) => ({
            label: r.bucket_label,
            count: Number(r.count),
          })),
        agentPairs: agentPairs.map((r) => ({
          callerId: r.caller_id,
          callerName: r.caller_name,
          calleeId: r.callee_id,
          calleeName: r.callee_name ?? "External",
          callCount: Number(r.call_count),
          successCount: Number(r.success_count),
          successRate: Number(r.call_count) > 0
            ? Math.round((Number(r.success_count) / Number(r.call_count)) * 100)
            : 0,
          avgDurationMs: Math.round(r.avg_duration_ms ?? 0),
          totalTokens: Number(r.total_tokens),
          totalCost: Number((r.total_cost ?? 0).toFixed(4)),
        })),
        latencyPercentiles: pctRow
          ? {
              p50Ms: Math.round(pctRow.p50_ms ?? 0),
              p95Ms: Math.round(pctRow.p95_ms ?? 0),
              p99Ms: Math.round(pctRow.p99_ms ?? 0),
              maxMs: Math.round(pctRow.max_ms ?? 0),
            }
          : null,
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
