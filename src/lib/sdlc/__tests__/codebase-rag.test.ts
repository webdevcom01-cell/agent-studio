/**
 * Unit tests for sdlc/codebase-rag.ts
 *
 * Focus areas for TASK 5:
 *   - indexCodebase: concurrent ingestion (all files indexed, no duplicates)
 *   - indexCodebase: individual file failures don't abort the whole run
 *   - indexCodebase: skips empty/whitespace-only files
 *   - indexCodebase: returns correct filesIndexed count
 *   - buildCodeContext: formats results correctly
 *   - searchCodebase: returns empty array when no KB found
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

/** Compute the same SHA-256 hash the implementation uses. */
function sha256(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before imports
// ---------------------------------------------------------------------------

const mockReaddir = vi.hoisted(() => vi.fn());
const mockReadFile = vi.hoisted(() => vi.fn());
const mockStat = vi.hoisted(() => vi.fn());
const mockExistsSync = vi.hoisted(() => vi.fn());
const mockPrismaKBUpsert = vi.hoisted(() => vi.fn());
const mockPrismaKBSourceFindMany = vi.hoisted(() => vi.fn());
const mockPrismaKBChunkDeleteMany = vi.hoisted(() => vi.fn());
const mockPrismaKBSourceDeleteMany = vi.hoisted(() => vi.fn());
const mockPrismaKBSourceCreate = vi.hoisted(() => vi.fn());
const mockPrismaKBFindUnique = vi.hoisted(() => vi.fn());
const mockIngestSource = vi.hoisted(() => vi.fn());
const mockSearchKnowledgeBase = vi.hoisted(() => vi.fn());

vi.mock("node:fs/promises", () => ({
  readdir: mockReaddir,
  readFile: mockReadFile,
  stat: mockStat,
}));

vi.mock("node:fs", () => ({
  existsSync: mockExistsSync,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    knowledgeBase: {
      upsert: mockPrismaKBUpsert,
      findUnique: mockPrismaKBFindUnique,
    },
    kBSource: {
      findMany: mockPrismaKBSourceFindMany,
      create: mockPrismaKBSourceCreate,
      deleteMany: mockPrismaKBSourceDeleteMany,
    },
    kBChunk: {
      deleteMany: mockPrismaKBChunkDeleteMany,
    },
  },
}));

vi.mock("@/lib/knowledge/ingest", () => ({
  ingestSource: mockIngestSource,
}));

vi.mock("@/lib/knowledge/search", () => ({
  searchKnowledgeBase: mockSearchKnowledgeBase,
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import { indexCodebase, searchCodebase, buildCodeContext } from "../codebase-rag";
import type { SearchResult } from "@/lib/knowledge/search";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStatDir() {
  return { isDirectory: () => true, isFile: () => false, size: 0 };
}

function makeStatFile(size = 1024) {
  return { isDirectory: () => false, isFile: () => true, size };
}

function makeKB(id = "kb-1") {
  return { id, agentId: "agent-1", name: "SDLC Codebase Index" };
}

function makeSource(id = "src-1") {
  return { id };
}

/** Set up mocks for a flat directory with N .ts files */
function setupFlatDir(fileNames: string[], workingDir = "/tmp/sdlc") {
  mockExistsSync.mockReturnValue(true);
  mockPrismaKBUpsert.mockResolvedValue(makeKB());
  mockPrismaKBSourceFindMany.mockResolvedValue([]);
  mockPrismaKBChunkDeleteMany.mockResolvedValue({ count: 0 });
  mockPrismaKBSourceDeleteMany.mockResolvedValue({ count: 0 });

  // readdir returns the file list for the root; no subdirs
  mockReaddir.mockResolvedValue(fileNames);

  // stat: all are files of normal size
  mockStat.mockResolvedValue(makeStatFile(1024));

  // readFile: return unique content for each file
  mockReadFile.mockImplementation(async (path: string) =>
    `// content of ${path}\nexport const x = 1;`,
  );

  // prisma.kBSource.create: return a source with unique ID per call
  let counter = 0;
  mockPrismaKBSourceCreate.mockImplementation(async () => makeSource(`src-${++counter}`));

  // ingestSource: succeed immediately
  mockIngestSource.mockResolvedValue(undefined);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// indexCodebase — concurrency
// ---------------------------------------------------------------------------

describe("indexCodebase — concurrent ingestion (TASK 5)", () => {
  it("indexes all files successfully", async () => {
    const files = Array.from({ length: 10 }, (_, i) => `file${i}.ts`);
    setupFlatDir(files);

    const result = await indexCodebase("/tmp/sdlc", "agent-1");

    expect(result.filesIndexed).toBe(10);
    expect(mockIngestSource).toHaveBeenCalledTimes(10);
    expect(mockPrismaKBSourceCreate).toHaveBeenCalledTimes(10);
  });

  it("indexes all files when count equals CONCURRENCY (5)", async () => {
    const files = Array.from({ length: 5 }, (_, i) => `file${i}.ts`);
    setupFlatDir(files);

    const result = await indexCodebase("/tmp/sdlc", "agent-1");

    expect(result.filesIndexed).toBe(5);
    expect(mockIngestSource).toHaveBeenCalledTimes(5);
  });

  it("indexes all files when count is greater than CONCURRENCY", async () => {
    const files = Array.from({ length: 20 }, (_, i) => `file${i}.ts`);
    setupFlatDir(files);

    const result = await indexCodebase("/tmp/sdlc", "agent-1");

    expect(result.filesIndexed).toBe(20);
    expect(mockIngestSource).toHaveBeenCalledTimes(20);
  });

  it("does NOT duplicate calls — each file indexed exactly once", async () => {
    const files = Array.from({ length: 15 }, (_, i) => `module${i}.ts`);
    setupFlatDir(files);

    await indexCodebase("/tmp/sdlc", "agent-1");

    // Each file path should appear exactly once in readFile calls
    const paths = mockReadFile.mock.calls.map((c) => c[0] as string);
    const unique = new Set(paths);
    expect(paths.length).toBe(unique.size);
  });

  it("individual file failure does not abort remaining files", async () => {
    const files = Array.from({ length: 5 }, (_, i) => `file${i}.ts`);
    setupFlatDir(files);

    // file2.ts fails on ingest
    let ingestCount = 0;
    mockIngestSource.mockImplementation(async () => {
      ingestCount++;
      if (ingestCount === 3) throw new Error("embedding API error");
    });

    const result = await indexCodebase("/tmp/sdlc", "agent-1");

    // 4 out of 5 should succeed
    expect(result.filesIndexed).toBe(4);
  });

  it("skips whitespace-only files without indexing", async () => {
    const files = ["real.ts", "empty.ts"];
    setupFlatDir(files);

    mockReadFile.mockImplementation(async (path: string) => {
      if ((path as string).includes("empty")) return "   \n  "; // whitespace only
      return "export const x = 1;";
    });

    const result = await indexCodebase("/tmp/sdlc", "agent-1");

    expect(result.filesIndexed).toBe(1);
    expect(mockIngestSource).toHaveBeenCalledTimes(1);
  });

  it("returns 0 when working directory does not exist", async () => {
    mockExistsSync.mockReturnValue(false);

    const result = await indexCodebase("/nonexistent", "agent-1");

    expect(result.filesIndexed).toBe(0);
    expect(mockPrismaKBUpsert).not.toHaveBeenCalled();
  });

  it("returns 0 when no indexable files found", async () => {
    mockExistsSync.mockReturnValue(true);
    mockPrismaKBUpsert.mockResolvedValue(makeKB());
    mockPrismaKBSourceFindMany.mockResolvedValue([]);
    mockPrismaKBChunkDeleteMany.mockResolvedValue({ count: 0 });
    mockPrismaKBSourceDeleteMany.mockResolvedValue({ count: 0 });
    // Directory has no files
    mockReaddir.mockResolvedValue([]);

    const result = await indexCodebase("/tmp/sdlc", "agent-1");

    expect(result.filesIndexed).toBe(0);
    expect(mockIngestSource).not.toHaveBeenCalled();
  });

  it("uses upsert for KnowledgeBase creation (race-condition safe)", async () => {
    setupFlatDir(["file.ts"]);

    await indexCodebase("/tmp/sdlc", "agent-1");

    expect(mockPrismaKBUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { agentId: "agent-1" },
        create: expect.objectContaining({ agentId: "agent-1" }),
        update: {},
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// indexCodebase — hash-based cache (P1)
// ---------------------------------------------------------------------------

describe("indexCodebase — hash-based content caching (P1)", () => {
  const CONTENT = "export const x = 1;";
  const CONTENT_HASH = sha256(CONTENT);

  /** Build a mock existing KBSource as returned by fetchExistingCodebaseSources */
  function makeExistingSource(
    id: string,
    relativePath: string,
    contentHash: string | null,
  ) {
    return {
      id,
      name: relativePath,
      customMetadata: {
        codebaseIndex: true,
        filePath: relativePath,
        contentHash,
        indexedAt: "2026-01-01T00:00:00.000Z",
      },
    };
  }

  it("skips unchanged file when content hash matches stored hash", async () => {
    mockExistsSync.mockReturnValue(true);
    mockPrismaKBUpsert.mockResolvedValue(makeKB());

    // Existing source with CORRECT hash
    mockPrismaKBSourceFindMany.mockResolvedValue([
      makeExistingSource("src-1", "file.ts", CONTENT_HASH),
    ]);

    mockReaddir.mockResolvedValue(["file.ts"]);
    mockStat.mockResolvedValue(makeStatFile(CONTENT.length));
    mockReadFile.mockResolvedValue(CONTENT);

    const result = await indexCodebase("/tmp/sdlc", "agent-1");

    expect(result.filesIndexed).toBe(0);
    expect(result.skipped).toBe(1);
    // Embedding must NOT be called for unchanged files
    expect(mockIngestSource).not.toHaveBeenCalled();
    expect(mockPrismaKBSourceCreate).not.toHaveBeenCalled();
  });

  it("re-indexes file when content hash has changed", async () => {
    mockExistsSync.mockReturnValue(true);
    mockPrismaKBUpsert.mockResolvedValue(makeKB());
    mockPrismaKBChunkDeleteMany.mockResolvedValue({ count: 1 });
    mockPrismaKBSourceDeleteMany.mockResolvedValue({ count: 1 });
    mockPrismaKBSourceCreate.mockResolvedValue(makeSource("src-new"));
    mockIngestSource.mockResolvedValue(undefined);

    // Existing source with STALE hash
    mockPrismaKBSourceFindMany.mockResolvedValue([
      makeExistingSource("src-1", "file.ts", "old-hash-that-doesnt-match"),
    ]);

    mockReaddir.mockResolvedValue(["file.ts"]);
    mockStat.mockResolvedValue(makeStatFile(CONTENT.length));
    mockReadFile.mockResolvedValue(CONTENT); // content produces CONTENT_HASH

    const result = await indexCodebase("/tmp/sdlc", "agent-1");

    expect(result.filesIndexed).toBe(1);
    expect(result.skipped).toBe(0);

    // Old source must be deleted before creating the new one
    expect(mockPrismaKBChunkDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sourceId: { in: ["src-1"] } } }),
    );
    expect(mockPrismaKBSourceDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["src-1"] } } }),
    );

    // New source must store the updated hash
    expect(mockPrismaKBSourceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customMetadata: expect.objectContaining({
            contentHash: CONTENT_HASH,
          }),
        }),
      }),
    );
    expect(mockIngestSource).toHaveBeenCalledTimes(1);
  });

  it("deletes stale source for file that no longer exists in workspace", async () => {
    mockExistsSync.mockReturnValue(true);
    mockPrismaKBUpsert.mockResolvedValue(makeKB());
    mockPrismaKBChunkDeleteMany.mockResolvedValue({ count: 3 });
    mockPrismaKBSourceDeleteMany.mockResolvedValue({ count: 1 });

    // DB has a source for "deleted.ts" but it's no longer in the workspace
    mockPrismaKBSourceFindMany.mockResolvedValue([
      makeExistingSource("src-old", "deleted.ts", "some-hash"),
    ]);

    // Workspace is empty (the file was deleted)
    mockReaddir.mockResolvedValue([]);

    const result = await indexCodebase("/tmp/sdlc", "agent-1");

    expect(result.filesIndexed).toBe(0);

    // Stale source must be cleaned up
    expect(mockPrismaKBChunkDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sourceId: { in: ["src-old"] } } }),
    );
    expect(mockPrismaKBSourceDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["src-old"] } } }),
    );
  });

  it("mixed run: skips unchanged, re-indexes changed, indexes new, removes deleted", async () => {
    const unchangedContent = "const a = 1;";
    const changedContent = "const b = 2; // updated";
    const newContent = "const c = 3;";

    mockExistsSync.mockReturnValue(true);
    mockPrismaKBUpsert.mockResolvedValue(makeKB());
    mockPrismaKBChunkDeleteMany.mockResolvedValue({ count: 1 });
    mockPrismaKBSourceDeleteMany.mockResolvedValue({ count: 1 });

    let createCount = 0;
    mockPrismaKBSourceCreate.mockImplementation(async () =>
      makeSource(`src-new-${++createCount}`),
    );
    mockIngestSource.mockResolvedValue(undefined);

    mockPrismaKBSourceFindMany.mockResolvedValue([
      makeExistingSource("src-unchanged", "unchanged.ts", sha256(unchangedContent)),
      makeExistingSource("src-changed", "changed.ts", "old-hash"),   // hash mismatch
      makeExistingSource("src-deleted", "deleted.ts", "some-hash"),  // not in workspace
      // "new.ts" is NOT in existing sources → will be indexed fresh
    ]);

    // Workspace has: unchanged.ts, changed.ts, new.ts (NOT deleted.ts)
    mockReaddir.mockResolvedValue(["unchanged.ts", "changed.ts", "new.ts"]);
    mockStat.mockResolvedValue(makeStatFile(50));

    mockReadFile.mockImplementation(async (path: string) => {
      if ((path as string).includes("unchanged")) return unchangedContent;
      if ((path as string).includes("changed")) return changedContent;
      return newContent;
    });

    const result = await indexCodebase("/tmp/sdlc", "agent-1");

    expect(result.skipped).toBe(1);      // unchanged.ts
    expect(result.filesIndexed).toBe(2); // changed.ts + new.ts

    // 2 sources re-indexed (changed + new)
    expect(mockIngestSource).toHaveBeenCalledTimes(2);
    expect(mockPrismaKBSourceCreate).toHaveBeenCalledTimes(2);
  });

  it("stores contentHash in customMetadata of newly created source", async () => {
    const content = "export function hello() { return 'hi'; }";
    const expectedHash = sha256(content);

    mockExistsSync.mockReturnValue(true);
    mockPrismaKBUpsert.mockResolvedValue(makeKB());
    mockPrismaKBSourceFindMany.mockResolvedValue([]); // no prior sources
    mockPrismaKBSourceCreate.mockResolvedValue(makeSource("src-1"));
    mockIngestSource.mockResolvedValue(undefined);

    mockReaddir.mockResolvedValue(["lib.ts"]);
    mockStat.mockResolvedValue(makeStatFile(content.length));
    mockReadFile.mockResolvedValue(content);

    await indexCodebase("/tmp/sdlc", "agent-1");

    expect(mockPrismaKBSourceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customMetadata: expect.objectContaining({
            codebaseIndex: true,
            contentHash: expectedHash,
          }),
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// searchCodebase
// ---------------------------------------------------------------------------

describe("searchCodebase", () => {
  it("returns empty array when no KnowledgeBase exists", async () => {
    mockPrismaKBFindUnique.mockResolvedValue(null);
    const results = await searchCodebase("auth handler", "agent-1", 5);
    expect(results).toEqual([]);
  });

  it("returns search results when KB exists", async () => {
    mockPrismaKBFindUnique.mockResolvedValue(makeKB("kb-1"));
    const fakeResult: SearchResult = {
      content: "export function auth() {}",
      similarity: 0.92,
      metadata: { filePath: "src/lib/auth.ts" },
      sourceDocument: "src/lib/auth.ts",
      chunkIndex: 0,
    };
    mockSearchKnowledgeBase.mockResolvedValue([fakeResult]);

    const results = await searchCodebase("auth", "agent-1", 5);

    expect(results).toHaveLength(1);
    expect(results[0].similarity).toBe(0.92);
  });

  it("returns empty array when search throws", async () => {
    mockPrismaKBFindUnique.mockResolvedValue(makeKB());
    mockSearchKnowledgeBase.mockRejectedValue(new Error("pgvector error"));

    const results = await searchCodebase("query", "agent-1", 5);
    expect(results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildCodeContext
// ---------------------------------------------------------------------------

describe("buildCodeContext", () => {
  it("returns empty string for empty results", () => {
    expect(buildCodeContext([])).toBe("");
  });

  it("formats results into markdown code blocks", () => {
    const results: SearchResult[] = [
      {
        content: "export function auth() { return jwt.sign({}); }",
        similarity: 0.95,
        metadata: { filePath: "src/lib/auth.ts" },
        sourceDocument: "src/lib/auth.ts",
        chunkIndex: 0,
      },
    ];

    const out = buildCodeContext(results);

    expect(out).toContain("## Relevant Codebase Context");
    expect(out).toContain("src/lib/auth.ts");
    expect(out).toContain("0.950");
    expect(out).toContain("export function auth()");
    expect(out).toContain("```ts");
  });

  it("truncates long content at 2000 chars", () => {
    const longContent = "x".repeat(3000);
    const results: SearchResult[] = [
      {
        content: longContent,
        similarity: 0.8,
        metadata: { filePath: "big.ts" },
        sourceDocument: "big.ts",
        chunkIndex: 0,
      },
    ];

    const out = buildCodeContext(results);
    expect(out).toContain("[truncated]");
    // The full 3000-char content should NOT be present
    expect(out).not.toContain("x".repeat(2100));
  });
});
