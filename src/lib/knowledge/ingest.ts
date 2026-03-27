import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { createHash } from "crypto";
import { parseSource } from "./parsers";
import { chunkText, estimateTokens, chunkByStrategy } from "./chunker";
import type { ChunkingStrategy } from "./chunker";
import { generateEmbeddings } from "./embeddings";
import { markChunkEmbeddingModel } from "./embedding-drift";
import { computeContentHash as computeChunkHash, findDuplicateChunks, deduplicateChunks } from "./deduplication";
import { enrichChunksWithContext } from "./contextual-enrichment";
import { logger } from "@/lib/logger";

const BATCH_SIZE = 50;
const DEFAULT_MAX_CHUNKS = 500;
const MAX_RETRIES = 3;

async function updateProgress(sourceId: string, stage: string, progress: number): Promise<void> {
  try {
    await prisma.kBSource.update({
      where: { id: sourceId },
      data: {
        processingProgress: {
          stage,
          progress: Math.round(progress),
          updatedAt: new Date().toISOString(),
        },
      },
    });
  } catch {
    // Fire-and-forget
  }
}

interface KBConfig {
  id: string;
  chunkingStrategy: unknown;
  embeddingModel: string | null;
  maxChunks: number | null;
  contextualEnrichment: boolean;
}

async function loadKBConfig(sourceId: string): Promise<KBConfig | null> {
  try {
    const source = await prisma.kBSource.findUnique({
      where: { id: sourceId },
      select: {
        knowledgeBase: {
          select: {
            id: true,
            chunkingStrategy: true,
            embeddingModel: true,
            maxChunks: true,
          },
        },
      },
    });
    if (!source?.knowledgeBase) return null;

    // contextualEnrichment is in schema.prisma + DB but not in generated types yet
    // (pnpm db:generate is blocked in this environment due to 403 on binary fetch).
    // Fetched via raw query until types are regenerated.
    const enrichRows = await prisma.$queryRaw<Array<{ contextualEnrichment: boolean }>>(
      Prisma.sql`SELECT "contextualEnrichment" FROM "KnowledgeBase" WHERE id = ${source.knowledgeBase.id} LIMIT 1`,
    );

    return {
      ...source.knowledgeBase,
      contextualEnrichment: enrichRows[0]?.contextualEnrichment ?? false,
    };
  } catch {
    return null;
  }
}

function parseStrategy(raw: unknown): ChunkingStrategy | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (!obj.type || typeof obj.type !== "string") return null;
  return obj as unknown as ChunkingStrategy;
}

function computeContentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export async function ingestSource(
  sourceId: string,
  textContent?: string
): Promise<{ chunksCreated: number }> {
  const source = await prisma.kBSource.findUniqueOrThrow({
    where: { id: sourceId },
  });

  if (source.retryCount >= MAX_RETRIES) {
    logger.warn("Source exceeded max retry limit, skipping", {
      sourceId,
      retryCount: source.retryCount,
    });
    return { chunksCreated: 0 };
  }

  await prisma.kBSource.update({
    where: { id: sourceId },
    data: { status: "PROCESSING", retryCount: { increment: 1 } },
  });

  try {
    updateProgress(sourceId, "parsing", 0).catch(() => {});

    let finalText: string;

    if (source.type === "TEXT") {
      finalText = textContent ?? source.rawContent ?? "";
    } else if (source.type === "URL" || source.type === "SITEMAP") {
      finalText = await parseSource({ type: source.type, url: source.url });
    } else if (source.type === "FILE" && textContent) {
      finalText = textContent;
    } else {
      throw new Error(`Cannot ingest source type ${source.type} without content`);
    }

    if (!finalText.trim()) throw new Error("No content extracted");

    updateProgress(sourceId, "chunking", 20).catch(() => {});

    const kbConfig = await loadKBConfig(sourceId);
    const strategy = parseStrategy(kbConfig?.chunkingStrategy);
    const maxChunks = kbConfig?.maxChunks ?? DEFAULT_MAX_CHUNKS;
    const embeddingModel = kbConfig?.embeddingModel ?? undefined;

    const allChunks = strategy
      ? chunkByStrategy(finalText, strategy)
      : chunkText(finalText);

    if (allChunks.length === 0) throw new Error("No chunks generated");

    const chunks = allChunks.length > maxChunks
      ? allChunks.slice(0, maxChunks)
      : allChunks;

    if (allChunks.length > maxChunks) {
      logger.warn("Source exceeded max chunk limit, truncating", {
        sourceId,
        totalChunks: allChunks.length,
        maxChunks,
      });
    }

    updateProgress(sourceId, "deduplication", 40).catch(() => {});

    // Deduplicate against existing chunks in the same KB
    let chunkHashes: string[] = [];
    let dedupedChunks = chunks;
    if (kbConfig?.id) {
      const allHashes = chunks.map(computeChunkHash);
      const existing = await findDuplicateChunks(kbConfig.id, allHashes);
      const deduped = deduplicateChunks(chunks, existing);
      dedupedChunks = deduped.unique;
      chunkHashes = deduped.hashes;
      if (deduped.duplicateCount > 0) {
        logger.info("Deduplication skipped chunks", {
          sourceId,
          duplicates: deduped.duplicateCount,
          remaining: dedupedChunks.length,
        });
      }
    } else {
      chunkHashes = chunks.map(computeChunkHash);
    }

    if (dedupedChunks.length === 0) {
      await prisma.kBSource.update({
        where: { id: sourceId },
        data: { status: "READY", charCount: finalText.length, errorMsg: null },
      });
      return { chunksCreated: 0 };
    }

    // ── Contextual Enrichment (Anthropic approach) ───────────────────────────
    // Prepend LLM-generated context to each chunk so embeddings capture
    // document-level context (company name, time period, section, etc.)
    // Only runs when enabled in KB settings. Falls back gracefully on failure.
    let chunksToEmbed = dedupedChunks;
    if (kbConfig?.contextualEnrichment) {
      updateProgress(sourceId, "enriching", 45).catch(() => {});
      logger.info("Starting contextual enrichment", {
        sourceId,
        chunkCount: dedupedChunks.length,
      });
      chunksToEmbed = await enrichChunksWithContext(dedupedChunks, finalText);
      logger.info("Contextual enrichment complete", {
        sourceId,
        chunkCount: chunksToEmbed.length,
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

    updateProgress(sourceId, "embedding", 50).catch(() => {});

    const embeddings = await generateEmbeddings(chunksToEmbed, embeddingModel);

    for (let i = 0; i < embeddings.length; i++) {
      if (!embeddings[i].every((v) => typeof v === "number" && isFinite(v))) {
        throw new Error(`Embedding at index ${i} contains invalid values`);
      }
    }

    updateProgress(sourceId, "storing", 90).catch(() => {});

    await prisma.kBChunk.deleteMany({ where: { sourceId } });

    for (let batchStart = 0; batchStart < chunksToEmbed.length; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, chunksToEmbed.length);
      const values = [];

      for (let i = batchStart; i < batchEnd; i++) {
        const content = chunksToEmbed[i];
        const embedding = embeddings[i];
        const tokens = estimateTokens(content);
        const vectorStr = `[${embedding.join(",")}]`;
        const hash = chunkHashes[i] ?? "";
        const metadata = JSON.stringify({ index: i, total: chunksToEmbed.length, contentHash: hash });

        values.push(
          Prisma.sql`(gen_random_uuid()::text, ${content}, ${vectorStr}::vector, ${tokens}, ${metadata}::jsonb, NOW(), ${sourceId}, ${hash})`
        );
      }

      await prisma.$executeRaw`
        INSERT INTO "KBChunk" ("id", "content", "embedding", "tokens", "metadata", "createdAt", "sourceId", "contentHash")
        VALUES ${Prisma.join(values)}
      `;
    }

    const contentHash = computeContentHash(finalText);

    updateProgress(sourceId, "storing", 100).catch(() => {});

    await prisma.kBSource.update({
      where: { id: sourceId },
      data: {
        status: "READY",
        charCount: finalText.length,
        errorMsg: null,
        contentHash,
        lastIngestedAt: new Date(),
        processingProgress: { stage: "complete", progress: 100, updatedAt: new Date().toISOString() },
      },
    });

    // Mark chunks with the embedding model used (for drift detection)
    if (embeddingModel) {
      markChunkEmbeddingModel(sourceId, embeddingModel).catch(() => {});
    }

    return { chunksCreated: dedupedChunks.length };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Source ingestion failed", err, { sourceId });
    await prisma.kBSource.update({
      where: { id: sourceId },
      data: { status: "FAILED", errorMsg: err.message },
    });
    throw error;
  }
}

export async function deleteSourceChunks(sourceId: string): Promise<void> {
  await prisma.kBChunk.deleteMany({ where: { sourceId } });
}
