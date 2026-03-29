import { describe, it, expect, vi, beforeEach } from "vitest";
import { memoryReadHandler } from "../memory-read-handler";
import type { RuntimeContext } from "../../types";
import type { FlowNode } from "@/types";

// Mock prisma
const mockFindUnique = vi.fn();
const mockFindMany = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateMany = vi.fn();
const mockQueryRawUnsafe = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agentMemory: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
    $queryRawUnsafe: (...args: unknown[]) => mockQueryRawUnsafe(...args),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function makeNode(overrides: Partial<FlowNode["data"]> = {}): FlowNode {
  return {
    id: "mem-r-1",
    type: "memory_read",
    position: { x: 0, y: 0 },
    data: {
      label: "Memory Read",
      mode: "key",
      key: "user_name",
      category: "",
      searchQuery: "",
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

describe("memoryReadHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("key mode", () => {
    it("reads a single memory by key", async () => {
      mockFindUnique.mockResolvedValue({
        id: "mem-1",
        key: "user_name",
        value: "Alice",
        category: "general",
        importance: 0.5,
      });
      mockUpdate.mockResolvedValue({});

      const result = await memoryReadHandler(makeNode(), makeContext());

      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { agentId_key: { agentId: "agent-1", key: "user_name" } },
      });
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "mem-1" },
          data: { accessCount: { increment: 1 }, accessedAt: expect.any(Date) },
        })
      );
      expect(result.updatedVariables?.memory_result).toBe("Alice");
      expect(result.updatedVariables?.__last_memory_read).toEqual({
        mode: "key",
        key: "user_name",
        found: true,
        category: "general",
      });
    });

    it("returns null when key not found", async () => {
      mockFindUnique.mockResolvedValue(null);

      const result = await memoryReadHandler(makeNode(), makeContext());

      expect(result.updatedVariables?.memory_result).toBeNull();
      expect(result.updatedVariables?.__last_memory_read).toEqual({
        mode: "key",
        key: "user_name",
        found: false,
      });
    });

    it("fails when key is empty", async () => {
      const node = makeNode({ key: "" });
      const result = await memoryReadHandler(node, makeContext());

      expect(result.messages[0].content).toContain("no key specified");
      expect(mockFindUnique).not.toHaveBeenCalled();
    });

    it("resolves template variables in key", async () => {
      mockFindUnique.mockResolvedValue({
        id: "mem-1",
        key: "pref_42",
        value: "dark",
        category: "preferences",
        importance: 0.8,
      });
      mockUpdate.mockResolvedValue({});

      const node = makeNode({ key: "pref_{{user_id}}" });
      const ctx = makeContext({ variables: { user_id: "42" } });

      await memoryReadHandler(node, ctx);

      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { agentId_key: { agentId: "agent-1", key: "pref_42" } },
      });
    });

    it("uses custom output variable", async () => {
      mockFindUnique.mockResolvedValue({
        id: "mem-1",
        key: "color",
        value: "blue",
        category: "prefs",
        importance: 0.5,
      });
      mockUpdate.mockResolvedValue({});

      const node = makeNode({ outputVariable: "user_color" });
      const result = await memoryReadHandler(node, makeContext());

      expect(result.updatedVariables?.user_color).toBe("blue");
    });
  });

  describe("category mode", () => {
    it("reads memories by category", async () => {
      mockFindMany.mockResolvedValue([
        { id: "m1", key: "a", value: "v1", category: "prefs", importance: 0.9 },
        { id: "m2", key: "b", value: "v2", category: "prefs", importance: 0.5 },
      ]);
      mockUpdateMany.mockResolvedValue({ count: 2 });

      const node = makeNode({ mode: "category", category: "prefs" });
      const result = await memoryReadHandler(node, makeContext());

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { agentId: "agent-1", category: "prefs" },
          orderBy: { importance: "desc" },
          take: 5,
        })
      );
      expect(result.updatedVariables?.memory_result).toHaveLength(2);
      expect(result.updatedVariables?.__last_memory_read).toEqual({
        mode: "category",
        category: "prefs",
        count: 2,
      });
    });

    it("defaults to general category when empty", async () => {
      mockFindMany.mockResolvedValue([]);

      const node = makeNode({ mode: "category", category: "" });
      await memoryReadHandler(node, makeContext());

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { agentId: "agent-1", category: "general" },
        })
      );
    });

    it("updates access tracking for retrieved memories", async () => {
      mockFindMany.mockResolvedValue([
        { id: "m1", key: "a", value: "v1", category: "c", importance: 0.5 },
      ]);
      mockUpdateMany.mockResolvedValue({ count: 1 });

      const node = makeNode({ mode: "category", category: "c" });
      await memoryReadHandler(node, makeContext());

      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: ["m1"] } },
        data: { accessCount: { increment: 1 }, accessedAt: expect.any(Date) },
      });
    });

    it("respects topK limit", async () => {
      mockFindMany.mockResolvedValue([]);

      const node = makeNode({ mode: "category", category: "test", topK: 3 });
      await memoryReadHandler(node, makeContext());

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 3 })
      );
    });

    it("clamps topK to max 50", async () => {
      mockFindMany.mockResolvedValue([]);

      const node = makeNode({ mode: "category", category: "test", topK: 100 });
      await memoryReadHandler(node, makeContext());

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 })
      );
    });
  });

  describe("search mode", () => {
    it("fails when search query is empty", async () => {
      const node = makeNode({ mode: "search", searchQuery: "" });
      const result = await memoryReadHandler(node, makeContext());

      expect(result.messages[0].content).toContain("no search query");
    });

    it("falls back to text search when embedding fails", async () => {
      // The handler will try to import @/lib/ai and ai, which will fail in test
      // This triggers the fallback path
      mockFindMany.mockResolvedValue([
        { id: "m1", key: "hello_world", value: "test", category: "general", importance: 0.5 },
      ]);
      mockUpdateMany.mockResolvedValue({ count: 1 });

      const node = makeNode({ mode: "search", searchQuery: "hello" });
      const result = await memoryReadHandler(node, makeContext());

      // Should use fallback text search (findMany with contains)
      expect(result.updatedVariables?.memory_result).toBeDefined();
      const readMeta = result.updatedVariables?.__last_memory_read as Record<string, unknown> | undefined;
      expect(readMeta?.fallback).toBe(true);
    });
  });

  describe("unknown mode", () => {
    it("returns error for unknown mode", async () => {
      const node = makeNode({ mode: "invalid" });
      const result = await memoryReadHandler(node, makeContext());

      expect(result.messages[0].content).toContain('unknown mode "invalid"');
    });
  });

  describe("error handling", () => {
    it("handles database errors gracefully", async () => {
      mockFindUnique.mockRejectedValue(new Error("DB error"));

      const result = await memoryReadHandler(makeNode(), makeContext());

      expect(result.messages[0].content).toContain("trouble reading");
      expect(result.updatedVariables?.memory_result).toBeNull();
      expect(result.updatedVariables?.__last_memory_read).toEqual({
        mode: "key",
        success: false,
      });
    });
  });

  // ── searchQuery / query backward compat (P-03) ─────────────────────────

  describe("searchQuery field naming (P-03)", () => {
    it("reads searchQuery field in search mode", async () => {
      mockFindMany.mockResolvedValue([]);

      const node = makeNode({ mode: "search", searchQuery: "find me" });
      const result = await memoryReadHandler(node, makeContext());

      // Should attempt search (not fail with "no search query")
      const meta = result.updatedVariables?.__last_memory_read as Record<string, unknown> | undefined;
      expect(meta?.query).toBe("find me");
    });

    it("falls back to query field for legacy flows", async () => {
      mockFindMany.mockResolvedValue([]);

      const node = makeNode({ mode: "search", searchQuery: "", query: "legacy search" });
      const result = await memoryReadHandler(node, makeContext());

      const meta = result.updatedVariables?.__last_memory_read as Record<string, unknown> | undefined;
      expect(meta?.query).toBe("legacy search");
    });

    it("returns error when neither searchQuery nor query is set", async () => {
      const node = makeNode({ mode: "search", searchQuery: "", query: "" });
      const result = await memoryReadHandler(node, makeContext());

      expect(result.messages[0].content).toContain("no search query");
    });
  });
});
