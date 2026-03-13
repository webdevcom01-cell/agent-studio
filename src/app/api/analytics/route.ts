import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";

const SENSITIVE_NUMBER_PATTERN = /\d{4,}/;
const MAX_MESSAGE_LENGTH = 60;

type PeriodOption = "24h" | "7d" | "30d" | "90d";

const PERIOD_HOURS: Record<PeriodOption, number> = {
  "24h": 24,
  "7d": 168,
  "30d": 720,
  "90d": 2160,
};

function isValidPeriod(value: string): value is PeriodOption {
  return value in PERIOD_HOURS;
}

// ─── Row Types ──────────────────────────────────────────────────────────────

interface DailyRow {
  date: string;
  count: bigint;
}

interface HourlyRow {
  hour: string;
  count: bigint;
}

interface TopAgentRow {
  agentId: string;
  agentName: string;
  conversationCount: bigint;
  messageCount: bigint;
}

interface FirstMessageRow {
  content: string;
  count: bigint;
}

interface AvgResponseRow {
  date: string;
  avg_ms: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
}

interface KBCountRow {
  has_results: boolean;
  count: bigint;
}

interface ModelUsageRow {
  model: string;
  request_count: bigint;
  total_input_tokens: bigint;
  total_output_tokens: bigint;
  total_cost: number;
  avg_duration_ms: number;
}

interface ErrorRateRow {
  date: string;
  error_count: bigint;
  total_count: bigint;
}

interface CostByDayRow {
  date: string;
  total_cost: number;
  total_tokens: bigint;
}

interface TokenSummaryRow {
  total_input: bigint;
  total_output: bigint;
  total_cost: number;
}

interface ToolUsageRow {
  tool_name: string;
  call_count: bigint;
  avg_duration_ms: number;
  success_rate: number;
}

interface ConversationFunnelRow {
  step: string;
  count: bigint;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const rateResult = checkRateLimit(`analytics:${authResult.userId}`, 10);
  if (!rateResult.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests" },
      { status: 429 }
    );
  }

  const userId = authResult.userId;
  const periodParam = request.nextUrl.searchParams.get("period") ?? "30d";
  const period: PeriodOption = isValidPeriod(periodParam) ? periodParam : "30d";
  const hours = PERIOD_HOURS[period];

  const sinceDate = new Date();
  sinceDate.setHours(sinceDate.getHours() - hours);

  const useHourly = period === "24h";

  const [
    totalConversations,
    totalMessages,
    timeSeriesData,
    topAgents,
    commonFirstMessages,
    responsePercentiles,
    kbSearchCounts,
    modelUsage,
    errorRates,
    costByDay,
    tokenSummary,
    toolUsage,
    conversationFunnel,
  ] = await Promise.all([
    // 1. Total conversations
    prisma.conversation.count({
      where: { createdAt: { gte: sinceDate }, agent: { userId } },
    }),

    // 2. Total messages
    prisma.message.count({
      where: { createdAt: { gte: sinceDate }, conversation: { agent: { userId } } },
    }),

    // 3. Time series (hourly or daily)
    useHourly
      ? prisma.$queryRaw<HourlyRow[]>(
          Prisma.sql`
            SELECT
              TO_CHAR(c."createdAt", 'YYYY-MM-DD HH24:00') AS hour,
              COUNT(*)::bigint AS count
            FROM "Conversation" c
            INNER JOIN "Agent" a ON a."id" = c."agentId"
            WHERE c."createdAt" >= ${sinceDate} AND a."userId" = ${userId}
            GROUP BY TO_CHAR(c."createdAt", 'YYYY-MM-DD HH24:00')
            ORDER BY hour ASC
          `
        )
      : prisma.$queryRaw<DailyRow[]>(
          Prisma.sql`
            SELECT DATE(c."createdAt")::text AS date, COUNT(*)::bigint AS count
            FROM "Conversation" c
            INNER JOIN "Agent" a ON a."id" = c."agentId"
            WHERE c."createdAt" >= ${sinceDate} AND a."userId" = ${userId}
            GROUP BY DATE(c."createdAt")
            ORDER BY DATE(c."createdAt") ASC
          `
        ),

    // 4. Top agents
    prisma.$queryRaw<TopAgentRow[]>(
      Prisma.sql`
        SELECT
          a."id" AS "agentId", a."name" AS "agentName",
          COUNT(DISTINCT c."id")::bigint AS "conversationCount",
          COUNT(m."id")::bigint AS "messageCount"
        FROM "Agent" a
        LEFT JOIN "Conversation" c ON c."agentId" = a."id" AND c."createdAt" >= ${sinceDate}
        LEFT JOIN "Message" m ON m."conversationId" = c."id"
        WHERE a."userId" = ${userId}
        GROUP BY a."id", a."name"
        ORDER BY "conversationCount" DESC
        LIMIT 10
      `
    ),

    // 5. Common first messages
    prisma.$queryRaw<FirstMessageRow[]>(
      Prisma.sql`
        SELECT fm."content", COUNT(*)::bigint AS "count"
        FROM (
          SELECT DISTINCT ON (m."conversationId") m."content"
          FROM "Message" m
          INNER JOIN "Conversation" c ON c."id" = m."conversationId"
          INNER JOIN "Agent" a ON a."id" = c."agentId"
          WHERE m."role" = 'USER' AND c."createdAt" >= ${sinceDate} AND a."userId" = ${userId}
          ORDER BY m."conversationId", m."createdAt" ASC
        ) fm
        GROUP BY fm."content"
        ORDER BY "count" DESC
        LIMIT 20
      `
    ),

    // 6. Response time percentiles (p50, p95, p99) by day
    prisma.$queryRaw<AvgResponseRow[]>(
      Prisma.sql`
        SELECT
          DATE(ae."createdAt")::text AS date,
          AVG(ae."durationMs")::float AS avg_ms,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ae."durationMs")::float AS p50_ms,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ae."durationMs")::float AS p95_ms,
          PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY ae."durationMs")::float AS p99_ms
        FROM "AnalyticsEvent" ae
        INNER JOIN "Agent" a ON a."id" = ae."agentId"
        WHERE ae.type = 'CHAT_RESPONSE'
          AND ae."durationMs" IS NOT NULL
          AND ae."createdAt" >= ${sinceDate}
          AND a."userId" = ${userId}
        GROUP BY DATE(ae."createdAt")
        ORDER BY DATE(ae."createdAt") ASC
      `
    ),

    // 7. KB search hit rate
    prisma.$queryRaw<KBCountRow[]>(
      Prisma.sql`
        SELECT
          ((ae.metadata->>'resultCount')::int > 0) AS has_results,
          COUNT(*)::bigint AS count
        FROM "AnalyticsEvent" ae
        INNER JOIN "Agent" a ON a."id" = ae."agentId"
        WHERE ae.type = 'KB_SEARCH'
          AND ae."createdAt" >= ${sinceDate}
          AND a."userId" = ${userId}
        GROUP BY has_results
      `
    ),

    // 8. Model usage breakdown
    prisma.$queryRaw<ModelUsageRow[]>(
      Prisma.sql`
        SELECT
          ae."model" AS model,
          COUNT(*)::bigint AS request_count,
          COALESCE(SUM(ae."inputTokens"), 0)::bigint AS total_input_tokens,
          COALESCE(SUM(ae."outputTokens"), 0)::bigint AS total_output_tokens,
          COALESCE(SUM(ae."costUsd"::numeric), 0)::float AS total_cost,
          AVG(ae."durationMs")::float AS avg_duration_ms
        FROM "AnalyticsEvent" ae
        INNER JOIN "Agent" a ON a."id" = ae."agentId"
        WHERE ae.type = 'CHAT_RESPONSE'
          AND ae."model" IS NOT NULL
          AND ae."createdAt" >= ${sinceDate}
          AND a."userId" = ${userId}
        GROUP BY ae."model"
        ORDER BY request_count DESC
      `
    ),

    // 9. Error rates by day
    prisma.$queryRaw<ErrorRateRow[]>(
      Prisma.sql`
        SELECT
          DATE(ae."createdAt")::text AS date,
          SUM(CASE WHEN ae.type = 'ERROR' THEN 1 ELSE 0 END)::bigint AS error_count,
          COUNT(*)::bigint AS total_count
        FROM "AnalyticsEvent" ae
        INNER JOIN "Agent" a ON a."id" = ae."agentId"
        WHERE ae."createdAt" >= ${sinceDate}
          AND a."userId" = ${userId}
        GROUP BY DATE(ae."createdAt")
        ORDER BY DATE(ae."createdAt") ASC
      `
    ),

    // 10. Cost by day
    prisma.$queryRaw<CostByDayRow[]>(
      Prisma.sql`
        SELECT
          DATE(ae."createdAt")::text AS date,
          COALESCE(SUM(ae."costUsd"::numeric), 0)::float AS total_cost,
          COALESCE(SUM(ae."totalTokens"), 0)::bigint AS total_tokens
        FROM "AnalyticsEvent" ae
        INNER JOIN "Agent" a ON a."id" = ae."agentId"
        WHERE ae."costUsd" IS NOT NULL
          AND ae."createdAt" >= ${sinceDate}
          AND a."userId" = ${userId}
        GROUP BY DATE(ae."createdAt")
        ORDER BY DATE(ae."createdAt") ASC
      `
    ),

    // 11. Token summary
    prisma.$queryRaw<TokenSummaryRow[]>(
      Prisma.sql`
        SELECT
          COALESCE(SUM(ae."inputTokens"), 0)::bigint AS total_input,
          COALESCE(SUM(ae."outputTokens"), 0)::bigint AS total_output,
          COALESCE(SUM(ae."costUsd"::numeric), 0)::float AS total_cost
        FROM "AnalyticsEvent" ae
        INNER JOIN "Agent" a ON a."id" = ae."agentId"
        WHERE ae."createdAt" >= ${sinceDate}
          AND a."userId" = ${userId}
      `
    ),

    // 12. Tool usage stats
    prisma.$queryRaw<ToolUsageRow[]>(
      Prisma.sql`
        SELECT
          ae.metadata->>'toolName' AS tool_name,
          COUNT(*)::bigint AS call_count,
          AVG(ae."durationMs")::float AS avg_duration_ms,
          (SUM(CASE WHEN (ae.metadata->>'success')::boolean = true THEN 1 ELSE 0 END)::float
           / NULLIF(COUNT(*), 0) * 100)::float AS success_rate
        FROM "AnalyticsEvent" ae
        INNER JOIN "Agent" a ON a."id" = ae."agentId"
        WHERE ae.type = 'TOOL_CALL'
          AND ae."createdAt" >= ${sinceDate}
          AND a."userId" = ${userId}
        GROUP BY ae.metadata->>'toolName'
        ORDER BY call_count DESC
        LIMIT 20
      `
    ),

    // 13. Conversation funnel
    prisma.$queryRaw<ConversationFunnelRow[]>(
      Prisma.sql`
        SELECT step, COUNT(*)::bigint AS count FROM (
          SELECT 'started' AS step FROM "Conversation" c
          INNER JOIN "Agent" a ON a."id" = c."agentId"
          WHERE c."createdAt" >= ${sinceDate} AND a."userId" = ${userId}
          UNION ALL
          SELECT 'sent_message' AS step FROM "Conversation" c
          INNER JOIN "Agent" a ON a."id" = c."agentId"
          WHERE c."createdAt" >= ${sinceDate} AND a."userId" = ${userId}
            AND EXISTS (SELECT 1 FROM "Message" m WHERE m."conversationId" = c."id" AND m."role" = 'USER')
          UNION ALL
          SELECT 'multi_turn' AS step FROM "Conversation" c
          INNER JOIN "Agent" a ON a."id" = c."agentId"
          WHERE c."createdAt" >= ${sinceDate} AND a."userId" = ${userId}
            AND (SELECT COUNT(*) FROM "Message" m WHERE m."conversationId" = c."id" AND m."role" = 'USER') >= 3
          UNION ALL
          SELECT 'completed' AS step FROM "Conversation" c
          INNER JOIN "Agent" a ON a."id" = c."agentId"
          WHERE c."createdAt" >= ${sinceDate} AND a."userId" = ${userId}
            AND c."status" = 'COMPLETED'
        ) funnel
        GROUP BY step
      `
    ),
  ]);

  // ─── Process results ────────────────────────────────────────────────────

  const kbTotalSearches = kbSearchCounts.reduce((sum, r) => sum + Number(r.count), 0);
  const kbWithResults = Number(kbSearchCounts.find((r) => r.has_results === true)?.count ?? 0);
  const kbWithoutResults = Number(kbSearchCounts.find((r) => r.has_results === false)?.count ?? 0);
  const kbHitRate = kbTotalSearches > 0 ? Math.round((kbWithResults / kbTotalSearches) * 100) : 0;

  const filteredFirstMessages = commonFirstMessages
    .filter((row) => !SENSITIVE_NUMBER_PATTERN.test(row.content))
    .map((row) => ({
      message:
        row.content.length > MAX_MESSAGE_LENGTH
          ? row.content.slice(0, MAX_MESSAGE_LENGTH) + "..."
          : row.content,
      count: Number(row.count),
    }));

  const tokenSum = tokenSummary[0];
  const totalErrors = errorRates.reduce((sum, r) => sum + Number(r.error_count), 0);
  const totalEvents = errorRates.reduce((sum, r) => sum + Number(r.total_count), 0);

  // Overall avg response
  const allAvgs = responsePercentiles.map((r) => r.avg_ms).filter(Boolean);
  const overallAvgMs = allAvgs.length > 0
    ? Math.round(allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length)
    : 0;

  // Funnel
  const funnelMap = Object.fromEntries(
    conversationFunnel.map((r) => [r.step, Number(r.count)])
  );

  return NextResponse.json({
    success: true,
    data: {
      period,
      summary: {
        totalConversations,
        totalMessages,
        avgResponseTimeMs: overallAvgMs,
        kbSearchHitRate: kbHitRate,
        totalInputTokens: Number(tokenSum?.total_input ?? 0),
        totalOutputTokens: Number(tokenSum?.total_output ?? 0),
        totalCostUsd: Number((tokenSum?.total_cost ?? 0).toFixed(4)),
        errorRate: totalEvents > 0 ? Math.round((totalErrors / totalEvents) * 100) : 0,
      },
      timeSeries: useHourly
        ? (timeSeriesData as HourlyRow[]).map((r) => ({
            date: r.hour,
            count: Number(r.count),
          }))
        : (timeSeriesData as DailyRow[]).map((r) => ({
            date: r.date,
            count: Number(r.count),
          })),
      topAgents: topAgents.map((r) => ({
        agentId: r.agentId,
        agentName: r.agentName,
        conversationCount: Number(r.conversationCount),
        messageCount: Number(r.messageCount),
      })),
      commonFirstMessages: filteredFirstMessages,
      responsePercentiles: responsePercentiles.map((r) => ({
        date: r.date,
        avgMs: Math.round(r.avg_ms ?? 0),
        p50Ms: Math.round(r.p50_ms ?? 0),
        p95Ms: Math.round(r.p95_ms ?? 0),
        p99Ms: Math.round(r.p99_ms ?? 0),
      })),
      kbSearchStats: {
        totalSearches: kbTotalSearches,
        withResults: kbWithResults,
        withoutResults: kbWithoutResults,
      },
      modelUsage: modelUsage.map((r) => ({
        model: r.model,
        requestCount: Number(r.request_count),
        totalInputTokens: Number(r.total_input_tokens),
        totalOutputTokens: Number(r.total_output_tokens),
        totalCostUsd: Number((r.total_cost ?? 0).toFixed(4)),
        avgDurationMs: Math.round(r.avg_duration_ms ?? 0),
      })),
      errorRates: errorRates.map((r) => ({
        date: r.date,
        errorCount: Number(r.error_count),
        totalCount: Number(r.total_count),
        rate: Number(r.total_count) > 0
          ? Math.round((Number(r.error_count) / Number(r.total_count)) * 100)
          : 0,
      })),
      costTrend: costByDay.map((r) => ({
        date: r.date,
        costUsd: Number((r.total_cost ?? 0).toFixed(4)),
        totalTokens: Number(r.total_tokens),
      })),
      toolUsage: toolUsage.map((r) => ({
        toolName: r.tool_name,
        callCount: Number(r.call_count),
        avgDurationMs: Math.round(r.avg_duration_ms ?? 0),
        successRate: Math.round(r.success_rate ?? 0),
      })),
      conversationFunnel: {
        started: funnelMap["started"] ?? 0,
        sentMessage: funnelMap["sent_message"] ?? 0,
        multiTurn: funnelMap["multi_turn"] ?? 0,
        completed: funnelMap["completed"] ?? 0,
      },
    },
  });
}
