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

/**
 * Index all code files in workingDir into the agent's KnowledgeBase.
 * Returns the number of files indexed.
 */
export async function indexCodebase(
  workingDir: string,
  agentId: string,
): Promise<{ filesIndexed: number; knowledgeBaseId: string }> {
  if (!existsSync(workingDir)) {
    logger.warn("codebase-rag: workingDir does not exist, skipping index", { workingDir });
    return { filesIndexed: 0, knowledgeBaseId: "" };
  }

  // 1. Find or create the agent's KnowledgeBase
  const kb = await findOrCreateKB(agentId);

  // 2. Remove stale codebase sources from the previous run
  await deleteCodebaseSources(kb.id);

  // 3. Collect indexable files
  const files = await collectFiles(workingDir);
  logger.info("codebase-rag: files collected for indexing", {
    agentId,
    workingDir,
    count: files.length,
  });

  if (files.length === 0) {
    return { filesIndexed: 0, knowledgeBaseId: kb.id };
  }

  // 4. Ingest files concurrently using a worker-pool semaphore.
  //
  //    Each worker picks the next file from the queue when it finishes the current
  //    one. This keeps all CONCURRENCY slots busy at all times — unlike a fixed
  //    batch approach where a slow file in a batch stalls the whole batch.
  //
  //    CONCURRENCY=5 is chosen to balance throughput against:
  //      - DB connection pool pressure (prisma default pool ≈ 10)
  //      - OpenAI embeddings rate limit (~3 000 RPM on free tier)
  //      - Railway Railway memory constraints (avoid OOM on large repos)
  let indexed = 0;
  const queue = [...files]; // mutable work queue
  const indexFile = async (filePath: string): Promise<void> => {
    try {
      const content = await readFile(filePath, "utf-8");
      if (!content.trim()) return;

      const relativePath = relative(workingDir, filePath);
      const language = extToLanguage(extname(filePath));

      const source = await prisma.kBSource.create({
        data: {
          type: "TEXT",
          name: relativePath,
          rawContent: content,
          knowledgeBaseId: kb.id,
          language,
          customMetadata: {
            [CODEBASE_SOURCE_TAG]: true,
            filePath: relativePath,
            indexedAt: new Date().toISOString(),
          },
        },
      });

      // chunk + embed + store vectors (the expensive part — runs concurrently)
      await ingestSource(source.id, content);
      indexed++;
    } catch (err) {
      logger.warn("codebase-rag: failed to index file", {
        filePath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // Spin up CONCURRENCY workers; each drains from the shared queue
  const CONCURRENCY = 5;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const next = queue.shift();
        if (next === undefined) break;
        await indexFile(next);
      }
    }),
  );

  logger.info("codebase-rag: indexing complete", {
    agentId,
    knowledgeBaseId: kb.id,
    filesIndexed: indexed,
    concurrency: CONCURRENCY,
  });

  return { filesIndexed: indexed, knowledgeBaseId: kb.id };
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

async function deleteCodebaseSources(knowledgeBaseId: string): Promise<void> {
  // Filter at the DB level using a JSON path predicate so we don't load the
  // entire KnowledgeBase (potentially thousands of documents) into Node memory.
  // The @> operator checks that customMetadata contains { codebaseIndex: true }.
  const codebaseSources = await prisma.kBSource.findMany({
    where: {
      knowledgeBaseId,
      customMetadata: { path: [CODEBASE_SOURCE_TAG], equals: true },
    },
    select: { id: true },
  });

  if (codebaseSources.length === 0) return;

  const ids = codebaseSources.map((s) => s.id);

  // Delete chunks first, then sources (explicit cascade for clarity)
  await prisma.kBChunk.deleteMany({ where: { sourceId: { in: ids } } });
  await prisma.kBSource.deleteMany({ where: { id: { in: ids } } });

  logger.info("codebase-rag: deleted stale codebase sources", { count: ids.length });
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
