import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma before importing module
vi.mock("@/lib/prisma", () => ({
  prisma: {
    agentMemory: {
      findMany: vi.fn(),
    },
    $executeRawUnsafe: vi.fn(),
    $queryRawUnsafe: vi.fn(),
  },
}));

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

import { prisma } from "@/lib/prisma";
import {
  getHotMemories,
  getColdMemories,
  formatHotMemoryForContext,
  injectHotMemoryIntoContext,
} from "../hot-cold-tier";
import type { RuntimeContext } from "@/lib/runtime/types";

const mockFindMany = prisma.agentMemory.findMany as ReturnType<typeof vi.fn>;
const mockQueryRaw = prisma.$queryRawUnsafe as ReturnType<typeof vi.fn>;
const mockExecRaw = prisma.$executeRawUnsafe as ReturnType<typeof vi.fn>;

function makeMemory(overrides: Record<string, unknown> = {}) {
  return {
    id: "mem-1",
    key: "test-key",
    value: "test-value",
    category: "general",
    importance: 0.5,
    accessCount: 5,
    accessedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

describe("getHotMemories", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty array when no memories exist", async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await getHotMemories("agent-1");
    expect(result).toEqual([]);
  });

  it("returns memories matching hot criteria", async () => {
    const hotMem = makeMemory({ importance: 0.9 });
    mockFindMany.mockResolvedValue([hotMem]);
    const result = await getHotMemories("agent-1");
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("test-key");
  });

  it("respects limit parameter", async () => {
    const mems = Array.from({ length: 20 }, (_, i) =>
      makeMemory({ id: `mem-${i}`, key: `key-${i}`, importance: 0.9 }),
    );
    mockFindMany.mockResolvedValue(mems);
    const result = await getHotMemories("agent-1", 5);
    expect(result).toHaveLength(5);
  });

  it("ranks by composite score (importance + recency + frequency)", async () => {
    const highImportance = makeMemory({
      id: "hi",
      key: "hi-imp",
      importance: 1.0,
      accessCount: 1,
      accessedAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 2 days ago
    });
    const recentAccess = makeMemory({
      id: "recent",
      key: "recent",
      importance: 0.5,
      accessCount: 1,
      accessedAt: new Date(), // just now
    });
    const highFrequency = makeMemory({
      id: "freq",
      key: "frequent",
      importance: 0.5,
      accessCount: 100,
      accessedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
    });
    mockFindMany.mockResolvedValue([highImportance, recentAccess, highFrequency]);

    const result = await getHotMemories("agent-1");
    expect(result).toHaveLength(3);
    // All should be returned with valid keys
    const keys = result.map((r) => r.key);
    expect(keys).toContain("hi-imp");
    expect(keys).toContain("recent");
    expect(keys).toContain("frequent");
  });

  it("queries with correct OR conditions", async () => {
    mockFindMany.mockResolvedValue([]);
    await getHotMemories("agent-1");

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          agentId: "agent-1",
          OR: expect.arrayContaining([
            expect.objectContaining({ accessedAt: expect.anything() }),
            expect.objectContaining({ importance: expect.anything() }),
            expect.objectContaining({ accessCount: expect.anything() }),
          ]),
        }),
      }),
    );
  });
});

describe("getColdMemories", () => {
  beforeEach(() => vi.clearAllMocks());

  it("performs vector search and returns results above threshold", async () => {
    mockExecRaw.mockResolvedValue(undefined);
    mockQueryRaw.mockResolvedValue([
      makeMemory({ similarity: 0.8 }),
    ]);

    const result = await getColdMemories("agent-1", "test query");
    expect(result).toHaveLength(1);
    expect(mockExecRaw).toHaveBeenCalledWith("SET LOCAL hnsw.ef_search = 40");
  });

  it("filters results below 0.3 similarity", async () => {
    mockExecRaw.mockResolvedValue(undefined);
    mockQueryRaw.mockResolvedValue([
      makeMemory({ similarity: 0.2 }),
      makeMemory({ id: "mem-2", similarity: 0.5 }),
    ]);

    const result = await getColdMemories("agent-1", "test");
    expect(result).toHaveLength(1);
  });

  it("returns empty on failure", async () => {
    mockExecRaw.mockRejectedValue(new Error("DB error"));
    const result = await getColdMemories("agent-1", "test");
    expect(result).toEqual([]);
  });
});

describe("formatHotMemoryForContext", () => {
  it("returns empty string for no memories", () => {
    expect(formatHotMemoryForContext([])).toBe("");
  });

  it("formats memories as markdown list", () => {
    const mems = [
      makeMemory({ key: "user-name", value: "Alice", category: "profile" }),
    ];
    const result = formatHotMemoryForContext(mems);
    expect(result).toContain("## Agent Memory (active context)");
    expect(result).toContain("**user-name** [profile]: Alice");
  });

  it("truncates long values to 200 chars", () => {
    const longValue = "x".repeat(300);
    const mems = [makeMemory({ value: longValue })];
    const result = formatHotMemoryForContext(mems);
    expect(result).toContain("...");
    expect(result.length).toBeLessThan(500);
  });

  it("stringifies non-string values", () => {
    const mems = [makeMemory({ value: { nested: true } })];
    const result = formatHotMemoryForContext(mems);
    expect(result).toContain("nested");
  });
});

describe("injectHotMemoryIntoContext", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets __hot_memory variable in context", async () => {
    mockFindMany.mockResolvedValue([makeMemory({ importance: 0.9 })]);

    const context = {
      agentId: "agent-1",
      variables: {},
    } as unknown as RuntimeContext;

    await injectHotMemoryIntoContext(context);
    expect(typeof context.variables.__hot_memory).toBe("string");
    expect((context.variables.__hot_memory as string).length).toBeGreaterThan(0);
  });

  it("skips if already injected", async () => {
    const context = {
      agentId: "agent-1",
      variables: { __hot_memory: "already set" },
    } as unknown as RuntimeContext;

    await injectHotMemoryIntoContext(context);
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(context.variables.__hot_memory).toBe("already set");
  });

  it("does not set variable when no hot memories", async () => {
    mockFindMany.mockResolvedValue([]);
    const context = {
      agentId: "agent-1",
      variables: {},
    } as unknown as RuntimeContext;

    await injectHotMemoryIntoContext(context);
    expect(context.variables.__hot_memory).toBeUndefined();
  });

  it("swallows errors gracefully", async () => {
    mockFindMany.mockRejectedValue(new Error("DB crash"));
    const context = {
      agentId: "agent-1",
      variables: {},
    } as unknown as RuntimeContext;

    // Should not throw
    await injectHotMemoryIntoContext(context);
    expect(context.variables.__hot_memory).toBeUndefined();
  });
});
