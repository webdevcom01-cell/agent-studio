import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Phase 0e regression-guard tests for memoryReadHandler vector search path
// ---------------------------------------------------------------------------
//
// memoryReadHandler in "search" mode runs a SET LOCAL + raw SELECT against
// AgentMemory. Before Phase 0e these were two separate Prisma calls; the
// patch wraps them in $transaction so the ef_search session var pins to the
// same pool connection as the SELECT.
//
// These tests verify the SHAPE — $transaction is called, SET LOCAL runs on
// the tx, the SELECT runs on the same tx. They cannot verify pool-survival
// semantics (TODO: real Postgres integration for Phase 1+).
//
// The existing test file (memory-read-handler.test.ts) exercises the
// fallback path that runs when embedding generation fails; it does not
// touch the SET LOCAL line. This file complements it.

vi.mock("@/lib/prisma", () => {
  const tx = {
    $executeRawUnsafe: vi.fn(),
    $queryRawUnsafe: vi.fn(),
  };
  return {
    prisma: {
      agentMemory: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: vi.fn(
        async (fn: (tx: typeof tx) => Promise<unknown>) => fn(tx),
      ),
      // Legacy direct paths — must NOT be used by the patched implementation
      $executeRawUnsafe: vi.fn(),
      $queryRawUnsafe: vi.fn(),
      _tx: tx,
    },
  };
});

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/ai", () => ({
  getEmbeddingModel: vi.fn(() => "mock-embedding-model"),
}));

vi.mock("ai", () => ({
  embed: vi.fn(async () => ({
    embedding: new Array(1536).fill(0.1),
  })),
}));

import { memoryReadHandler } from "../memory-read-handler";
import { prisma } from "@/lib/prisma";
import type { RuntimeContext } from "../../types";
import type { FlowNode } from "@/types";

const mockPrisma = prisma as unknown as {
  $transaction: ReturnType<typeof vi.fn>;
  $executeRawUnsafe: ReturnType<typeof vi.fn>;
  $queryRawUnsafe: ReturnType<typeof vi.fn>;
  agentMemory: {
    updateMany: ReturnType<typeof vi.fn>;
  };
  _tx: {
    $executeRawUnsafe: ReturnType<typeof vi.fn>;
    $queryRawUnsafe: ReturnType<typeof vi.fn>;
  };
};

function makeNode(overrides: Partial<FlowNode["data"]> = {}): FlowNode {
  return {
    id: "mem-r-1",
    type: "memory_read",
    position: { x: 0, y: 0 },
    data: {
      label: "Memory Read",
      mode: "search",
      key: "",
      category: "",
      searchQuery: "find user notes",
      outputVariable: "memory_result",
      topK: 5,
      ...overrides,
    },
  };
}

function makeContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    agentId: "agent-1",
    conversationId: "conv-1",
    variables: {},
    messageHistory: [],
    flowContent: { nodes: [], edges: [], variables: [] },
    currentNodeId: null,
    isNewConversation: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma._tx.$queryRawUnsafe.mockResolvedValue([]);
  mockPrisma.agentMemory.updateMany.mockResolvedValue({ count: 0 });
});

describe("memoryReadHandler search mode — Phase 0e $transaction shape", () => {
  it("opens a $transaction (does not run SET LOCAL on the outer prisma)", async () => {
    await memoryReadHandler(makeNode(), makeContext());

    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();

    // Pre-Phase-0e shape — must not appear
    expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("runs SET LOCAL hnsw.ef_search on the tx before the SELECT", async () => {
    const callOrder: string[] = [];
    mockPrisma._tx.$executeRawUnsafe.mockImplementation(async () => {
      callOrder.push("set_local");
      return 0;
    });
    mockPrisma._tx.$queryRawUnsafe.mockImplementation(async () => {
      callOrder.push("select");
      return [];
    });

    await memoryReadHandler(makeNode(), makeContext());

    expect(callOrder).toEqual(["set_local", "select"]);
    expect(mockPrisma._tx.$executeRawUnsafe).toHaveBeenCalledWith(
      "SET LOCAL hnsw.ef_search = 40",
    );
  });

  it("returns memory results from the tx.$queryRawUnsafe call", async () => {
    mockPrisma._tx.$queryRawUnsafe.mockResolvedValue([
      {
        id: "mem-A",
        key: "user_pref",
        value: "dark mode",
        category: "general",
        importance: 0.7,
        similarity: 0.85,
      },
    ]);

    const result = await memoryReadHandler(makeNode(), makeContext());

    // Result should reach updatedVariables.memory_result
    expect(result.updatedVariables?.memory_result).toBeDefined();
  });
});

// TODO(rls-phase-1): integration test against a real Postgres harness to
// verify ef_search actually survives onto the SELECT query.
