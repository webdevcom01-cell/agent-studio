/**
 * Content deduplication for Knowledge Base chunks.
 *
 * Prevents duplicate content from being embedded and stored when the same
 * document is uploaded multiple times or a URL is re-scraped.
 */

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";

/**
 * Computes a SHA-256 hash of normalized text content.
 * Normalization: lowercase, trim, collapse whitespace.
 */
export function computeContentHash(content: string): string {
  const normalized = content.trim().toLowerCase().replace(/\s+/g, " ");
  return createHash("sha256").update(normalized).digest("hex");
}

/**
 * Finds which content hashes already exist in the KB's chunks.
 * Returns a Set of hashes that are duplicates.
 */
export async function findDuplicateChunks(
  knowledgeBaseId: string,
  contentHashes: string[]
): Promise<Set<string>> {
  if (contentHashes.length === 0) return new Set();

  const rows = await prisma.$queryRaw<{ hash: string }[]>(
    Prisma.sql`
      SELECT DISTINCT c."contentHash" as hash
      FROM "KBChunk" c
      INNER JOIN "KBSource" s ON c."sourceId" = s."id"
      WHERE s."knowledgeBaseId" = ${knowledgeBaseId}
        AND c."contentHash" = ANY(${contentHashes}::text[])
    `
  );

  return new Set(rows.map((r) => r.hash));
}

/**
 * Filters out chunks whose content hash already exists in the KB.
 * Returns only unique chunks and the count of skipped duplicates.
 */
export function deduplicateChunks(
  chunks: string[],
  existingHashes: Set<string>
): { unique: string[]; hashes: string[]; duplicateCount: number } {
  const unique: string[] = [];
  const hashes: string[] = [];
  let duplicateCount = 0;

  for (const chunk of chunks) {
    const hash = computeContentHash(chunk);
    if (existingHashes.has(hash)) {
      duplicateCount++;
    } else {
      unique.push(chunk);
      hashes.push(hash);
      existingHashes.add(hash);
    }
  }

  return { unique, hashes, duplicateCount };
}
