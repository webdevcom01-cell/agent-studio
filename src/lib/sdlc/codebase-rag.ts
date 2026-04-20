/**
 * codebase-rag.ts
 *
 * RAG (Retrieval-Augmented Generation) over a local codebase directory.
 *
 * Workflow:
 *   1. indexCodebase(workingDir, agentId)
 *      — Scans TS/JS/PY files in workingDir
 *      — Creates / reuses the agent's KnowledgeBase
 *      — Ingests each file as a TEXT KBSource (deletes stale codebase sources first)
 *
 *   2. searchCodebase(query, agentId, topK)
 *      — Hybrid vector + BM25 search over the indexed files
 *      — Returns ranked code snippets ready to inject into prompts
 *
 *   3. buildCodeContext(results)
 *      — Formats SearchResult[] into a Markdown code context block
 *
 * Design notes:
 *   • KnowledgeBase has agentId @unique — we reuse the agent's KB and tag
 *     codebase sources with metadata.codebaseIndex = true for easy cleanup.
 *   • We only index files ≤ 150 KB to avoid embedding cost runaway.
 *   • Each pipeline run re-indexes the workspace so RAG always reflects the
 *     latest state of /tmp/sdlc.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, extname, relative } from "node:path";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ingestSource } from "@/lib/knowledge/ingest";
import { searchKnowledgeBase } from "@/lib/knowledge/search";
import type { SearchResult } from "@/lib/knowledge/search";
import { logger } from "@/lib/logger";

/** File extensions we index */
const INDEXABLE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".md", ".json"]);

/** Directories to skip during indexing */
const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "coverage",
  ".turbo", ".cache", "__pycache__", ".mypy_cache",
]);

/** Max file size to index (150 KB) */
const MAX_FILE_BYTES = 150 * 1024;

/** Max total files to index per run (keep embedding costs bounded) */
const MAX_FILES = 200;

/** Metadata tag on KBSource records created by this module */
const CODEBASE_SOURCE_TAG = "codebaseIndex";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** SHA-256 hash of file content — used to skip unchanged files between runs. */
function computeContentHash(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}

interface FileEntry {
  relativePath: string;
  fullPath: string;
  content: string;
  hash: string;
}

/**
 * Index all code files in workingDir into the agent's KnowledgeBase.
 *
 * Hash-based caching: every file's SHA-256 content hash is stored in
 * `customMetadata.contentHash`. On subsequent runs, files whose content
 * hasn't changed are skipped entirely — no new embedding API calls, no
 * DB churn. Only new and modified files are re-embedded.
 *
 * Returns counts of indexed (re-embedded) and skipped (unchanged) files.
 */
export async function indexCodebase(
  workingDir: string,
  agentId: string,
): Promise<{ filesIndexed: number; knowledgeBaseId: string; skipped: number }> {
  if (!existsSync(workingDir)) {
    logger.warn("codebase-rag: workingDir does not exist, skipping index", { workingDir });
    return { filesIndexed: 0, knowledgeBaseId: "", skipped: 0 };
  }

  // 1. Find or create the agent's KnowledgeBase
  const kb = await findOrCreateKB(agentId);

  // 2. Fetch existing codebase sources with their stored content hashes
  const existingSources = await fetchExistingCodebaseSources(kb.id);
  const existingByPath = new Map<string, { id: string; contentHash: string | null }>();
  for (const src of existingSources) {
    const meta = src.customMetadata as Record<string, unknown> | null;
    existingByPath.set(src.name, {
      id: src.id,
      contentHash: (meta?.contentHash as string) ?? null,
    });
  }

  // 3. Collect indexable files
  const filePaths = await collectFiles(workingDir);
  logger.info("codebase-rag: files collected for indexing", {
    agentId,
    workingDir,
    count: filePaths.length,
  });

  // 4. Read all files and compute content hashes (parallel, bounded by OS)
  const currentFiles = new Map<string, FileEntry>();
  await Promise.all(
    filePaths.map(async (fullPath) => {
      try {
        const content = await readFile(fullPath, "utf-8");
        if (!content.trim()) return; // skip empty / whitespace-only files
        const relativePath = relative(workingDir, fullPath);
        const hash = computeContentHash(content);
        currentFiles.set(relativePath, { relativePath, fullPath, content, hash });
      } catch (err) {
        logger.warn("codebase-rag: failed to read file for hashing", {
          fullPath,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );

  if (currentFiles.size === 0) {
    // No indexable content — remove any stale DB sources
    if (existingSources.length > 0) {
      const staleIds = existingSources.map((s) => s.id);
      await prisma.kBChunk.deleteMany({ where: { sourceId: { in: staleIds } } });
      await prisma.kBSource.deleteMany({ where: { id: { in: staleIds } } });
    }
    return { filesIndexed: 0, knowledgeBaseId: kb.id, skipped: 0 };
  }

  // 5. Classify each current file: skip (unchanged hash), re-index (hash changed), new (no prior source)
  //    Also collect stale sources for files that have been deleted from the workspace.
  const currentPaths = new Set(currentFiles.keys());
  const staleSourceIds = existingSources
    .filter((s) => !currentPaths.has(s.name))
    .map((s) => s.id);

  const toIndex: Array<FileEntry & { oldSourceId?: string }> = [];
  let skipped = 0;

  for (const [relativePath, entry] of currentFiles) {
    const existing = existingByPath.get(relativePath);
    if (existing && existing.contentHash === entry.hash) {
      // Content unchanged — reuse existing KBSource and its embeddings
      skipped++;
    } else {
      toIndex.push({ ...entry, oldSourceId: existing?.id });
    }
  }

  // 6. Delete stale sources (deleted files) and changed sources (to be replaced)
  const idsToDelete = [
    ...staleSourceIds,
    ...toIndex.filter((f) => f.oldSourceId !== undefined).map((f) => f.oldSourceId!),
  ];
  if (idsToDelete.length > 0) {
    await prisma.kBChunk.deleteMany({ where: { sourceId: { in: idsToDelete } } });
    await prisma.kBSource.deleteMany({ where: { id: { in: idsToDelete } } });
  }

  logger.info("codebase-rag: cache analysis complete", {
    agentId,
    total: currentFiles.size,
    toIndex: toIndex.length,
    skipped,
    staleDeleted: staleSourceIds.length,
  });

  if (toIndex.length === 0) {
    logger.info("codebase-rag: all files unchanged — skipping embedding", { agentId });
    return { filesIndexed: 0, knowledgeBaseId: kb.id, skipped };
  }

  // 7. Index new/changed files with worker pool.
  //    CONCURRENCY=5: balances throughput vs DB pool + OpenAI RPM limits.
  let indexed = 0;
  const queue = [...toIndex];
  const CONCURRENCY = 5;

  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const next = queue.shift();
        if (next === undefined) break;
        try {
          const source = await prisma.kBSource.create({
            data: {
              type: "TEXT",
              name: next.relativePath,
              rawContent: next.content,
              knowledgeBaseId: kb.id,
              language: extToLanguage(extname(next.fullPath)),
              customMetadata: {
                [CODEBASE_SOURCE_TAG]: true,
                filePath: next.relativePath,
                contentHash: next.hash,        // ← stored for next-run comparison
                indexedAt: new Date().toISOString(),
              },
            },
          });
          // chunk + embed + store vectors (the expensive part)
          await ingestSource(source.id, next.content);
          indexed++;
        } catch (err) {
          logger.warn("codebase-rag: failed to index file", {
            filePath: next.relativePath,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }),
  );

  logger.info("codebase-rag: indexing complete", {
    agentId,
    knowledgeBaseId: kb.id,
    filesIndexed: indexed,
    skipped,
    concurrency: CONCURRENCY,
  });

  return { filesIndexed: indexed, knowledgeBaseId: kb.id, skipped };
}

/**
 * Search the indexed codebase for code relevant to a query.
 * Returns an empty array if no KB exists or no results found.
 */
export async function searchCodebase(
  query: string,
  agentId: string,
  topK = 5,
): Promise<SearchResult[]> {
  try {
    const kb = await prisma.knowledgeBase.findUnique({ where: { agentId } });
    if (!kb) return [];

    const results = await searchKnowledgeBase(kb.id, query, topK);
    return results;
  } catch (err) {
    logger.warn("codebase-rag: search failed", {
      agentId,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Format search results into a Markdown code context block
 * suitable for injection into an AI prompt.
 */
export function buildCodeContext(results: SearchResult[]): string {
  if (results.length === 0) return "";

  const blocks = results.map((r) => {
    const meta = r.metadata as Record<string, unknown> | undefined;
    const filePath = (meta?.filePath as string) ?? (r.sourceDocument ?? "unknown");
    const score = r.similarity.toFixed(3);
    const ext = extname(filePath).slice(1) || "text";
    const snippet = r.content.length > 2000
      ? r.content.slice(0, 2000) + "\n… [truncated]"
      : r.content;
    return `### ${filePath} (relevance: ${score})\n\`\`\`${ext}\n${snippet}\n\`\`\``;
  });

  return `## Relevant Codebase Context\n\n${blocks.join("\n\n")}`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function findOrCreateKB(agentId: string) {
  // Use upsert instead of findUnique + create to prevent a race condition when
  // two pipeline runs start simultaneously for the same agent. Both might see
  // findUnique → null and both attempt create → unique constraint violation.
  return prisma.knowledgeBase.upsert({
    where: { agentId },
    update: {}, // KB already exists — no fields to change
    create: {
      agentId,
      name: "SDLC Codebase Index",
      retrievalMode: "hybrid",
      hybridAlpha: 0.7,
      searchTopK: 8,
      searchThreshold: 0.2,
      rerankingModel: "none",
      queryTransform: "none",
      contextOrdering: "relevance",
      fusionStrategy: "rrf",
      contextualEnrichment: false,
    },
  });
}

/**
 * Fetch all codebase-indexed sources for a KnowledgeBase, including their
 * stored content hashes. Used by indexCodebase to determine which files
 * can be skipped (unchanged) vs. need re-embedding (new or modified).
 */
async function fetchExistingCodebaseSources(knowledgeBaseId: string) {
  return prisma.kBSource.findMany({
    where: {
      knowledgeBaseId,
      customMetadata: { path: [CODEBASE_SOURCE_TAG], equals: true },
    },
    select: { id: true, name: true, customMetadata: true },
  });
}

async function collectFiles(dir: string, depth = 0): Promise<string[]> {
  if (depth > 8) return [];

  const files: string[] = [];
  let entries: string[];

  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (files.length >= MAX_FILES) break;
    if (SKIP_DIRS.has(entry)) continue;

    const fullPath = join(dir, entry);
    try {
      const info = await stat(fullPath);
      if (info.isDirectory()) {
        const sub = await collectFiles(fullPath, depth + 1);
        // Slice to respect the global limit even when a subdirectory alone exceeds it
        const capacity = MAX_FILES - files.length;
        files.push(...sub.slice(0, capacity));
      } else if (info.isFile() && INDEXABLE_EXTS.has(extname(entry))) {
        if (info.size <= MAX_FILE_BYTES) {
          files.push(fullPath);
        }
      }
    } catch {
      // Permission error or symlink — skip
    }
  }

  return files;
}

function extToLanguage(ext: string): string {
  const map: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".py": "python",
    ".md": "markdown",
    ".json": "json",
  };
  return map[ext] ?? "text";
}
