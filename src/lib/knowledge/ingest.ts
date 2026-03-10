import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { parseSource } from "./parsers";
import { chunkText, estimateTokens } from "./chunker";
import { generateEmbeddings } from "./embeddings";
import { logger } from "@/lib/logger";

const BATCH_SIZE = 50;
const MAX_CHUNKS = 500;
const MAX_RETRIES = 3;

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

    const allChunks = chunkText(finalText);
    if (allChunks.length === 0) throw new Error("No chunks generated");

    const chunks = allChunks.length > MAX_CHUNKS
      ? allChunks.slice(0, MAX_CHUNKS)
      : allChunks;

    if (allChunks.length > MAX_CHUNKS) {
      logger.warn("Source exceeded max chunk limit, truncating", {
        sourceId,
        totalChunks: allChunks.length,
        maxChunks: MAX_CHUNKS,
      });
    }

    const embeddings = await generateEmbeddings(chunks);

    for (let i = 0; i < embeddings.length; i++) {
      if (!embeddings[i].every((v) => typeof v === "number" && isFinite(v))) {
        throw new Error(`Embedding at index ${i} contains invalid values`);
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.kBChunk.deleteMany({ where: { sourceId } });

      for (let batchStart = 0; batchStart < chunks.length; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, chunks.length);
        const values = [];

        for (let i = batchStart; i < batchEnd; i++) {
          const content = chunks[i];
          const embedding = embeddings[i];
          const tokens = estimateTokens(content);
          const vectorStr = `[${embedding.join(",")}]`;
          const metadata = JSON.stringify({ index: i, total: chunks.length });

          values.push(
            Prisma.sql`(gen_random_uuid()::text, ${content}, ${vectorStr}::vector, ${tokens}, ${metadata}::jsonb, NOW(), ${sourceId})`
          );
        }

        await tx.$executeRaw`
          INSERT INTO "KBChunk" ("id", "content", "embedding", "tokens", "metadata", "createdAt", "sourceId")
          VALUES ${Prisma.join(values)}
        `;
      }
    });

    await prisma.kBSource.update({
      where: { id: sourceId },
      data: { status: "READY", charCount: finalText.length, errorMsg: null },
    });

    return { chunksCreated: chunks.length };
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
