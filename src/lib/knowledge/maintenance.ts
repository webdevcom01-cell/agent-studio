/**
 * Knowledge Base maintenance — dead chunk detection, cleanup, retrieval stats,
 * and scheduled re-ingestion support.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { logger } from "@/lib/logger";

const DEFAULT_DEAD_THRESHOLD_DAYS = 30;
const STALE_THRESHOLD_DAYS = 60;

// ── Dead Chunk Detection ─────────────────────────────────────────────────

export interface DeadChunkReport {
  totalChunks: number;
  deadChunks: number;
  deadPercentage: number;
  staleChunks: number;
  recommendation: "none" | "review" | "cleanup";
  topDeadSources: { sourceId: string; sourceName: string; deadCount: number }[];
}

interface CountRow { count: bigint }
interface DeadSourceRow { sourceId: string; sourceName: string; deadCount: bigint }

export async function detectDeadChunks(
  knowledgeBaseId: string,
  thresholdDays: number = DEFAULT_DEAD_THRESHOLD_DAYS
): Promise<DeadChunkReport> {
  const deadCutoff = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000);
  const staleCutoff = new Date(Date.now() - STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

  const [totalRows, deadRows, staleRows, topDead] = await Promise.all([
    prisma.$queryRaw<CountRow[]>(
      Prisma.sql`
        SELECT COUNT(*) as count FROM "KBChunk" c
        INNER JOIN "KBSource" s ON c."sourceId" = s."id"
        WHERE s."knowledgeBaseId" = ${knowledgeBaseId}
      `
    ),
    prisma.$queryRaw<CountRow[]>(
      Prisma.sql`
        SELECT COUNT(*) as count FROM "KBChunk" c
        INNER JOIN "KBSource" s ON c."sourceId" = s."id"
        WHERE s."knowledgeBaseId" = ${knowledgeBaseId}
          AND c."retrievalCount" = 0
          AND c."createdAt" < ${deadCutoff}
      `
    ),
    prisma.$queryRaw<CountRow[]>(
      Prisma.sql`
        SELECT COUNT(*) as count FROM "KBChunk" c
        INNER JOIN "KBSource" s ON c."sourceId" = s."id"
        WHERE s."knowledgeBaseId" = ${knowledgeBaseId}
          AND c."lastRetrievedAt" IS NOT NULL
          AND c."lastRetrievedAt" < ${staleCutoff}
      `
    ),
    prisma.$queryRaw<DeadSourceRow[]>(
      Prisma.sql`
        SELECT c."sourceId", s."name" as "sourceName", COUNT(*) as "deadCount"
        FROM "KBChunk" c
        INNER JOIN "KBSource" s ON c."sourceId" = s."id"
        WHERE s."knowledgeBaseId" = ${knowledgeBaseId}
          AND c."retrievalCount" = 0
          AND c."createdAt" < ${deadCutoff}
        GROUP BY c."sourceId", s."name"
        ORDER BY "deadCount" DESC
        LIMIT 5
      `
    ),
  ]);

  const totalChunks = Number(totalRows[0]?.count ?? 0);
  const deadChunks = Number(deadRows[0]?.count ?? 0);
  const staleChunks = Number(staleRows[0]?.count ?? 0);
  const deadPercentage = totalChunks > 0 ? deadChunks / totalChunks : 0;

  let recommendation: "none" | "review" | "cleanup" = "none";
  if (deadPercentage >= 0.5) recommendation = "cleanup";
  else if (deadPercentage >= 0.1) recommendation = "review";

  return {
    totalChunks,
    deadChunks,
    deadPercentage,
    staleChunks,
    recommendation,
    topDeadSources: topDead.map((r) => ({
      sourceId: r.sourceId,
      sourceName: r.sourceName,
      deadCount: Number(r.deadCount),
    })),
  };
}

export async function cleanupDeadChunks(
  knowledgeBaseId: string,
  thresholdDays: number = DEFAULT_DEAD_THRESHOLD_DAYS
): Promise<{ deletedCount: number }> {
  const cutoff = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000);

  const result = await prisma.$executeRaw`
    DELETE FROM "KBChunk"
    WHERE "id" IN (
      SELECT c."id" FROM "KBChunk" c
      INNER JOIN "KBSource" s ON c."sourceId" = s."id"
      WHERE s."knowledgeBaseId" = ${knowledgeBaseId}
        AND c."retrievalCount" = 0
        AND c."createdAt" < ${cutoff}
    )
  `;

  const deletedCount = typeof result === "number" ? result : 0;

  logger.info("Dead chunks cleaned up", {
    knowledgeBaseId,
    deletedCount,
    thresholdDays,
  });

  return { deletedCount };
}

// ── Retrieval Stats ──────────────────────────────────────────────────────

export async function updateChunkRetrievalStats(chunkIds: string[]): Promise<void> {
  if (chunkIds.length === 0) return;

  try {
    await prisma.$executeRaw`
      UPDATE "KBChunk"
      SET "retrievalCount" = "retrievalCount" + 1,
          "lastRetrievedAt" = NOW()
      WHERE "id" = ANY(${chunkIds}::text[])
    `;
  } catch {
    // Fire-and-forget
  }
}

// ── Scheduled Re-ingestion ───────────────────────────────────────────────

const SCHEDULE_INTERVALS: Record<string, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};

export async function getSourcesDueForReingestion(
  knowledgeBaseId: string
): Promise<string[]> {
  const sources = await prisma.kBSource.findMany({
    where: {
      knowledgeBaseId,
      reingestionEnabled: true,
      reingestionSchedule: { not: null },
    },
    select: {
      id: true,
      reingestionSchedule: true,
      lastIngestedAt: true,
    },
  });

  const now = Date.now();
  const due: string[] = [];

  for (const source of sources) {
    const schedule = source.reingestionSchedule ?? "weekly";
    const intervalDays = SCHEDULE_INTERVALS[schedule] ?? 7;
    const intervalMs = intervalDays * 24 * 60 * 60 * 1000;
    const lastIngested = source.lastIngestedAt?.getTime() ?? 0;

    if (now - lastIngested >= intervalMs) {
      due.push(source.id);
    }
  }

  return due;
}

export async function triggerReingestion(
  sourceIds: string[]
): Promise<{ triggered: number; failed: number }> {
  let triggered = 0;
  let failed = 0;

  const { ingestSource } = await import("./ingest");

  for (const sourceId of sourceIds) {
    try {
      await ingestSource(sourceId);
      triggered++;
    } catch (err) {
      failed++;
      logger.warn("Re-ingestion failed for source", {
        sourceId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info("Re-ingestion batch complete", { triggered, failed });

  return { triggered, failed };
}
