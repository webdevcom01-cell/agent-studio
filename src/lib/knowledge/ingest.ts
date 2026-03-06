import { prisma } from "@/lib/prisma";
import { parseSource } from "./parsers";
import { chunkText, estimateTokens } from "./chunker";
import { generateEmbeddings } from "./embeddings";

export async function ingestSource(
  sourceId: string,
  textContent?: string
): Promise<{ chunksCreated: number }> {
  const source = await prisma.kBSource.findUniqueOrThrow({
    where: { id: sourceId },
  });

  await prisma.kBSource.update({
    where: { id: sourceId },
    data: { status: "PROCESSING" },
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

    const chunks = chunkText(finalText);
    if (chunks.length === 0) throw new Error("No chunks generated");

    const embeddings = await generateEmbeddings(chunks);

    await deleteSourceChunks(sourceId);

    for (let i = 0; i < chunks.length; i++) {
      const content = chunks[i];
      const embedding = embeddings[i];
      const tokens = estimateTokens(content);
      const vectorStr = `[${embedding.join(",")}]`;
      const metadata = JSON.stringify({ index: i, total: chunks.length });

      await prisma.$executeRaw`
        INSERT INTO "KBChunk" ("id", "content", "embedding", "tokens", "metadata", "createdAt", "sourceId")
        VALUES (
          gen_random_uuid()::text,
          ${content},
          ${vectorStr}::vector,
          ${tokens},
          ${metadata}::jsonb,
          NOW(),
          ${sourceId}
        )
      `;
    }

    await prisma.kBSource.update({
      where: { id: sourceId },
      data: { status: "READY", charCount: finalText.length, errorMsg: null },
    });

    return { chunksCreated: chunks.length };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Ingest error:", err);
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
