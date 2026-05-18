import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Phase 0e regression-guard tests for searchKnowledgeBase
// ---------------------------------------------------------------------------
//
// Background: searchKnowledgeBase previously ran two separate Prisma calls —
//   await prisma.$executeRaw(`SET LOCAL hnsw.ef_search = …`)
//   await prisma.$queryRaw(...)
// — which Prisma could distribute across two pool connections, silently
// reverting the ef_search tuning before the SELECT.
//
// Phase 0e patched this to:
//   await prisma.$transaction(async (tx) => {
//     await tx.$executeRaw(`SET LOCAL hnsw.ef_search = …`)
//     return tx.$queryRaw(...)
//   })
//
// These tests verify the SHAPE of the fix:
//   - $transaction is used (not direct prisma.$executeRaw)
//   - SET LOCAL runs on the tx (not the outer client)
//   - the SELECT runs on the same tx
//
// They cannot verify pool-survival semantics — that needs a real Postgres
// integration harness (TODO for Phase 1+).

vi.mock("@/lib/prisma", () => {
  // Factory must be self-contained — vitest hoists vi.mock to top of file,
  // so we cannot reference top-level variables here. State is exposed via
  // helpers below that read from the mocked module after import.
  const tx = {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
  };
  return {
    prisma: {
      knowledgeBase: {
        findUnique: vi.fn(),
      },
      $transaction: vi.fn(
        async (fn: (tx: typeof tx) => Promise<unknown>) => fn(tx),
      ),
      // Legacy direct paths — must NOT be used by the patched implementation
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(),
      _tx: tx,
    },
  };
});

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/observability/metrics", () => ({
  recordMetric: vi.fn(),
}));

vi.mock("../embeddings", () => ({
  generateEmbedding: vi.fn(async () => new Array(1536).fill(0.1)),
}));

vi.mock("../embedding-cache", () => ({
  getCachedQueryEmbedding: vi.fn(async () => null),
  setCachedQueryEmbedding: vi.fn(async () => undefined),
}));

import { searchKnowledgeBase } from "../search";
import { prisma } from "@/lib/prisma";

// Pull mocked instances back out for assertions
const mockPrisma = prisma as unknown as {
  $transaction: ReturnType<typeof vi.fn>;
  $executeRaw: ReturnType<typeof vi.fn>;
  $queryRaw: ReturnType<typeof vi.fn>;
  _tx: {
    $executeRaw: ReturnType<typeof vi.fn>;
    $queryRaw: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma._tx.$queryRaw.mockResolvedValue([]);
});

describe("searchKnowledgeBase — Phase 0e $transaction shape", () => {
  it("opens a $transaction (does not run SET LOCAL on the outer prisma)", async () => {
    await searchKnowledgeBase("kb-1", "hello world", 5);

    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();

    // The pre-Phase-0e bug shape (SET LOCAL on outer prisma) must not appear.
    expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("runs SET LOCAL hnsw.ef_search on the tx, before the SELECT", async () => {
    const callOrder: string[] = [];
    mockPrisma._tx.$executeRaw.mockImplementation(async () => {
      callOrder.push("set_local");
      return 0;
    });
    mockPrisma._tx.$queryRaw.mockImplementation(async () => {
      callOrder.push("select");
      return [];
    });

    await searchKnowledgeBase("kb-1", "hello world", 5);

    expect(callOrder).toEqual(["set_local", "select"]);
    expect(mockPrisma._tx.$executeRaw).toHaveBeenCalledOnce();
    expect(mockPrisma._tx.$queryRaw).toHaveBeenCalledOnce();
  });

  it("returns whatever tx.$queryRaw returns, mapped through the result shape", async () => {
    mockPrisma._tx.$queryRaw.mockResolvedValue([
      {
        id: "chunk-A",
        content: "result content",
        similarity: 0.91,
        sourceId: "src-1",
        sourceName: "Doc",
        sourceType: "pdf",
        metadata: null,
      },
    ]);

    const result = await searchKnowledgeBase("kb-1", "hello world", 5);

    expect(result).toHaveLength(1);
    expect(result[0].chunkId).toBe("chunk-A");
    expect(result[0].similarity).toBe(0.91);
  });
});

// TODO(rls-phase-1): integration test against a real Postgres harness to
// verify ef_search actually survives onto the SELECT query — mocked tests
// only verify call shape, not the pool-survival semantics being fixed.
