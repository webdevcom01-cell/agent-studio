/**
 * Embedding drift detection for Knowledge Base.
 *
 * Detects when KB chunks were embedded with a different model than the
 * currently configured one. Advises the user to re-ingest for consistency.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { logger } from "@/lib/logger";

export interface EmbeddingDriftStatus {
  hasDrift: boolean;
  currentModel: string;
  chunksTotal: number;
  chunksWithCurrentModel: number;
  chunksWithOtherModel: number;
  stalePercentage: number;
  recommendation: "none" | "warn" | "reindex";
}

interface CountRow {
  count: bigint;
}

export async function detectEmbeddingDrift(
  knowledgeBaseId: string
): Promise<EmbeddingDriftStatus> {
  try {
    const kb = await prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
      select: { embeddingModel: true },
    });

    const currentModel = kb?.embeddingModel ?? "text-embedding-3-small";

    const [totalRows, matchRows] = await Promise.all([
      prisma.$queryRaw<CountRow[]>(
        Prisma.sql`
          SELECT COUNT(*) as count
          FROM "KBChunk" c
          INNER JOIN "KBSource" s ON c."sourceId" = s."id"
          WHERE s."knowledgeBaseId" = ${knowledgeBaseId}
        `
      ),
      prisma.$queryRaw<CountRow[]>(
        Prisma.sql`
          SELECT COUNT(*) as count
          FROM "KBChunk" c
          INNER JOIN "KBSource" s ON c."sourceId" = s."id"
          WHERE s."knowledgeBaseId" = ${knowledgeBaseId}
            AND c."metadata"->>'embeddingModel' = ${currentModel}
        `
      ),
    ]);

    const chunksTotal = Number(totalRows[0]?.count ?? 0);
    const chunksWithCurrentModel = Number(matchRows[0]?.count ?? 0);
    const chunksWithOtherModel = chunksTotal - chunksWithCurrentModel;

    if (chunksTotal === 0) {
      return {
        hasDrift: false,
        currentModel,
        chunksTotal: 0,
        chunksWithCurrentModel: 0,
        chunksWithOtherModel: 0,
        stalePercentage: 0,
        recommendation: "none",
      };
    }

    const stalePercentage = chunksWithOtherModel / chunksTotal;

    let recommendation: "none" | "warn" | "reindex" = "none";
    if (stalePercentage >= 0.3) {
      recommendation = "reindex";
    } else if (stalePercentage > 0) {
      recommendation = "warn";
    }

    return {
      hasDrift: stalePercentage > 0,
      currentModel,
      chunksTotal,
      chunksWithCurrentModel,
      chunksWithOtherModel,
      stalePercentage,
      recommendation,
    };
  } catch (err) {
    logger.warn("Embedding drift detection failed", {
      knowledgeBaseId,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      hasDrift: false,
      currentModel: "text-embedding-3-small",
      chunksTotal: 0,
      chunksWithCurrentModel: 0,
      chunksWithOtherModel: 0,
      stalePercentage: 0,
      recommendation: "none",
    };
  }
}

/**
 * Marks all chunks for a source with the embedding model used.
 * Uses JSONB merge (||) which is atomic and preserves other metadata keys.
 */
export async function markChunkEmbeddingModel(
  sourceId: string,
  modelId: string
): Promise<void> {
  try {
    const patch = JSON.stringify({ embeddingModel: modelId });
    await prisma.$executeRaw`
      UPDATE "KBChunk"
      SET "metadata" = COALESCE("metadata", '{}'::jsonb) || ${patch}::jsonb
      WHERE "sourceId" = ${sourceId}
    `;
  } catch (err) {
    logger.warn("Failed to mark chunk embedding model", {
      sourceId,
      modelId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
