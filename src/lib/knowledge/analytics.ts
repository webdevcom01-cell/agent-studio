/**
 * Knowledge Base analytics — usage stats, chunk distribution, search metrics.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { logger } from "@/lib/logger";
import { detectEmbeddingDrift } from "./embedding-drift";

export interface KBAnalytics {
  totalSources: number;
  totalChunks: number;
  totalTokens: number;
  avgChunkSize: number;
  sourcesByType: Record<string, number>;
  sourcesByStatus: Record<string, number>;
  embeddingModel: string;
  embeddingDriftStatus?: string;
  staleChunkPercentage?: number;
  searchMetrics: {
    avgLatencyMs: number;
    totalSearches: number;
    avgResultCount: number;
  };
  topRetrievedChunks: { chunkId: string; content: string; retrievalCount: number }[];
  chunkDistribution: { bucket: string; count: number }[];
}

interface SourceGroupRow {
  type: string;
  count: bigint;
}

interface StatusGroupRow {
  status: string;
  count: bigint;
}

interface ChunkStatsRow {
  total: bigint;
  total_tokens: bigint | null;
  avg_tokens: number | null;
}

interface BucketRow {
  bucket: string;
  count: bigint;
}

interface TopChunkRow {
  id: string;
  content: string;
  retrievalCount: number;
}

interface SearchMetricsRow {
  avg_latency: number | null;
  total_searches: bigint;
  avg_results: number | null;
}

export async function getKBAnalytics(knowledgeBaseId: string): Promise<KBAnalytics> {
  const defaults: KBAnalytics = {
    totalSources: 0,
    totalChunks: 0,
    totalTokens: 0,
    avgChunkSize: 0,
    sourcesByType: {},
    sourcesByStatus: {},
    embeddingModel: "text-embedding-3-small",
    searchMetrics: { avgLatencyMs: 0, totalSearches: 0, avgResultCount: 0 },
    topRetrievedChunks: [],
    chunkDistribution: [],
  };

  try {
    const kb = await prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
      select: { embeddingModel: true, agentId: true },
    });
    if (!kb) return defaults;
    defaults.embeddingModel = kb.embeddingModel;

    const [
      sourcesByType,
      sourcesByStatus,
      chunkStats,
      buckets,
      topChunks,
      drift,
      searchMetrics,
    ] = await Promise.all([
      prisma.$queryRaw<SourceGroupRow[]>(
        Prisma.sql`SELECT s."type", COUNT(*) as count FROM "KBSource" s WHERE s."knowledgeBaseId" = ${knowledgeBaseId} GROUP BY s."type"`
      ),
      prisma.$queryRaw<StatusGroupRow[]>(
        Prisma.sql`SELECT s."status", COUNT(*) as count FROM "KBSource" s WHERE s."knowledgeBaseId" = ${knowledgeBaseId} GROUP BY s."status"`
      ),
      prisma.$queryRaw<ChunkStatsRow[]>(
        Prisma.sql`
          SELECT COUNT(*) as total, SUM(c."tokens") as total_tokens, AVG(c."tokens") as avg_tokens
          FROM "KBChunk" c INNER JOIN "KBSource" s ON c."sourceId" = s."id"
          WHERE s."knowledgeBaseId" = ${knowledgeBaseId}
        `
      ),
      prisma.$queryRaw<BucketRow[]>(
        Prisma.sql`
          SELECT
            CASE
              WHEN c."tokens" < 100 THEN '0-100'
              WHEN c."tokens" < 200 THEN '100-200'
              WHEN c."tokens" < 300 THEN '200-300'
              WHEN c."tokens" < 500 THEN '300-500'
              ELSE '500+'
            END as bucket,
            COUNT(*) as count
          FROM "KBChunk" c INNER JOIN "KBSource" s ON c."sourceId" = s."id"
          WHERE s."knowledgeBaseId" = ${knowledgeBaseId}
          GROUP BY bucket ORDER BY bucket
        `
      ),
      prisma.$queryRaw<TopChunkRow[]>(
        Prisma.sql`
          SELECT c."id", LEFT(c."content", 200) as content, c."retrievalCount"
          FROM "KBChunk" c INNER JOIN "KBSource" s ON c."sourceId" = s."id"
          WHERE s."knowledgeBaseId" = ${knowledgeBaseId} AND c."retrievalCount" > 0
          ORDER BY c."retrievalCount" DESC LIMIT 10
        `
      ),
      detectEmbeddingDrift(knowledgeBaseId).catch(() => null),
      prisma.$queryRaw<SearchMetricsRow[]>(
        Prisma.sql`
          SELECT
            AVG((ae."metadata"->>'durationMs')::numeric) as avg_latency,
            COUNT(*) as total_searches,
            AVG((ae."metadata"->>'resultCount')::numeric) as avg_results
          FROM "AnalyticsEvent" ae
          WHERE ae."agentId" = ${kb.agentId} AND ae."type" = 'KB_SEARCH'
        `
      ).catch(() => [] as SearchMetricsRow[]),
    ]);

    const stats = chunkStats[0];
    const sm = searchMetrics[0];

    return {
      totalSources: sourcesByType.reduce((sum, r) => sum + Number(r.count), 0),
      totalChunks: Number(stats?.total ?? 0),
      totalTokens: Number(stats?.total_tokens ?? 0),
      avgChunkSize: Math.round(Number(stats?.avg_tokens ?? 0)),
      sourcesByType: Object.fromEntries(sourcesByType.map((r) => [r.type, Number(r.count)])),
      sourcesByStatus: Object.fromEntries(sourcesByStatus.map((r) => [r.status, Number(r.count)])),
      embeddingModel: kb.embeddingModel,
      embeddingDriftStatus: drift?.recommendation,
      staleChunkPercentage: drift?.stalePercentage,
      searchMetrics: {
        avgLatencyMs: Math.round(Number(sm?.avg_latency ?? 0)),
        totalSearches: Number(sm?.total_searches ?? 0),
        avgResultCount: Math.round(Number(sm?.avg_results ?? 0)),
      },
      topRetrievedChunks: topChunks.map((r) => ({
        chunkId: r.id,
        content: r.content,
        retrievalCount: Number(r.retrievalCount),
      })),
      chunkDistribution: buckets.map((r) => ({ bucket: r.bucket, count: Number(r.count) })),
    };
  } catch (err) {
    logger.warn("KB analytics query failed", {
      knowledgeBaseId,
      error: err instanceof Error ? err.message : String(err),
    });
    return defaults;
  }
}
