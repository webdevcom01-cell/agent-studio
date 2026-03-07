import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";

const SENSITIVE_NUMBER_PATTERN = /\d{4,}/;
const MAX_MESSAGE_LENGTH = 60;

type PeriodOption = "7d" | "30d" | "90d";

const PERIOD_DAYS: Record<PeriodOption, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

function isValidPeriod(value: string): value is PeriodOption {
  return value in PERIOD_DAYS;
}

interface DailyRow {
  date: string;
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
}

interface KBCountRow {
  has_results: boolean;
  count: bigint;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const periodParam = request.nextUrl.searchParams.get("period") ?? "30d";
  const period: PeriodOption = isValidPeriod(periodParam) ? periodParam : "30d";
  const days = PERIOD_DAYS[period];

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);

  const [
    totalConversations,
    totalMessages,
    dailyConversations,
    topAgents,
    commonFirstMessages,
    avgResponseByDay,
    kbSearchCounts,
    avgResponseOverall,
  ] = await Promise.all([
    prisma.conversation.count({
      where: { createdAt: { gte: sinceDate } },
    }),
    prisma.message.count({
      where: { createdAt: { gte: sinceDate } },
    }),
    prisma.$queryRaw<DailyRow[]>(
      Prisma.sql`
        SELECT DATE("createdAt")::text AS date, COUNT(*)::bigint AS count
        FROM "Conversation"
        WHERE "createdAt" >= ${sinceDate}
        GROUP BY DATE("createdAt")
        ORDER BY DATE("createdAt") ASC
      `
    ),
    prisma.$queryRaw<TopAgentRow[]>(
      Prisma.sql`
        SELECT
          a."id" AS "agentId",
          a."name" AS "agentName",
          COUNT(DISTINCT c."id")::bigint AS "conversationCount",
          COUNT(m."id")::bigint AS "messageCount"
        FROM "Agent" a
        LEFT JOIN "Conversation" c ON c."agentId" = a."id" AND c."createdAt" >= ${sinceDate}
        LEFT JOIN "Message" m ON m."conversationId" = c."id"
        GROUP BY a."id", a."name"
        ORDER BY "conversationCount" DESC
        LIMIT 10
      `
    ),
    prisma.$queryRaw<FirstMessageRow[]>(
      Prisma.sql`
        SELECT fm."content", COUNT(*)::bigint AS "count"
        FROM (
          SELECT DISTINCT ON (m."conversationId") m."content"
          FROM "Message" m
          INNER JOIN "Conversation" c ON c."id" = m."conversationId"
          WHERE m."role" = 'USER'
            AND c."createdAt" >= ${sinceDate}
          ORDER BY m."conversationId", m."createdAt" ASC
        ) fm
        GROUP BY fm."content"
        ORDER BY "count" DESC
        LIMIT 20
      `
    ),
    prisma.$queryRaw<AvgResponseRow[]>(
      Prisma.sql`
        SELECT
          DATE("createdAt")::text AS date,
          AVG((metadata->>'totalResponseTimeMs')::numeric)::float AS avg_ms
        FROM "AnalyticsEvent"
        WHERE type = 'CHAT_RESPONSE'
          AND "createdAt" >= ${sinceDate}
        GROUP BY DATE("createdAt")
        ORDER BY DATE("createdAt") ASC
      `
    ),
    prisma.$queryRaw<KBCountRow[]>(
      Prisma.sql`
        SELECT
          ((metadata->>'resultCount')::int > 0) AS has_results,
          COUNT(*)::bigint AS count
        FROM "AnalyticsEvent"
        WHERE type = 'KB_SEARCH'
          AND "createdAt" >= ${sinceDate}
        GROUP BY has_results
      `
    ),
    prisma.$queryRaw<[{ avg_ms: number | null }]>(
      Prisma.sql`
        SELECT AVG((metadata->>'totalResponseTimeMs')::numeric)::float AS avg_ms
        FROM "AnalyticsEvent"
        WHERE type = 'CHAT_RESPONSE'
          AND "createdAt" >= ${sinceDate}
      `
    ),
  ]);

  const kbTotalSearches = kbSearchCounts.reduce(
    (sum, r) => sum + Number(r.count),
    0
  );
  const kbWithResults = Number(
    kbSearchCounts.find((r) => r.has_results === true)?.count ?? 0
  );
  const kbWithoutResults = Number(
    kbSearchCounts.find((r) => r.has_results === false)?.count ?? 0
  );
  const kbHitRate =
    kbTotalSearches > 0
      ? Math.round((kbWithResults / kbTotalSearches) * 100)
      : 0;

  const filteredFirstMessages = commonFirstMessages
    .filter((row) => !SENSITIVE_NUMBER_PATTERN.test(row.content))
    .map((row) => ({
      message:
        row.content.length > MAX_MESSAGE_LENGTH
          ? row.content.slice(0, MAX_MESSAGE_LENGTH) + "..."
          : row.content,
      count: Number(row.count),
    }));

  return NextResponse.json({
    success: true,
    data: {
      summary: {
        totalConversations,
        totalMessages,
        avgResponseTimeMs: Math.round(avgResponseOverall[0]?.avg_ms ?? 0),
        kbSearchHitRate: kbHitRate,
      },
      dailyConversations: dailyConversations.map((r) => ({
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
      avgResponseTimeByDay: avgResponseByDay.map((r) => ({
        date: r.date,
        avgMs: Math.round(r.avg_ms ?? 0),
      })),
      kbSearchStats: {
        totalSearches: kbTotalSearches,
        withResults: kbWithResults,
        withoutResults: kbWithoutResults,
      },
    },
  });
}
