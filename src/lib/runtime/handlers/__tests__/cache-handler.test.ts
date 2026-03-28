import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCacheGet = vi.fn().mockResolvedValue(null);
const mockCacheSet = vi.fn().mockResolvedValue(undefined);
const mockCacheDel = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/redis", () => ({
  cacheGet: (...args: unknown[]) => mockCacheGet(...args),
  cacheSet: (...args: unknown[]) => mockCacheSet(...args),
  cacheDel: (...args: unknown[]) => mockCacheDel(...args),
}));

vi.mock("@/lib/knowledge/embeddings", () => ({
  generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
}));

import { cacheHandler } from "../cache-handler";
import type { RuntimeContext } from "../../types";
import type { FlowNode, FlowContent } from "@/types";

function makeNode(overrides: Record<string, unknown> = {}): FlowNode {
  return {
    id: "cache-1",
    type: "cache",
    position: { x: 0, y: 0 },
    data: {
      operation: "get",
      cacheKey: "test_key",
      outputVariable: "cache_result",
      ttlSeconds: 300,
      matchMode: "exact",
      ...overrides,
    },
  };
}

function makeContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: { nodes: [], edges: [], variables: [] } as FlowContent,
    currentNodeId: "cache-1",
    variables: {},
    messageHistory: [],
    isNewConversation: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("cacheHandler", () => {
  it("returns error when cache key is empty", async () => {
    const result = await cacheHandler(
      makeNode({ cacheKey: "" }),
      makeContext(),
    );
    expect(result.messages[0].content).toContain("no key");
  });

  it("routes to 'miss' handle when key not found", async () => {
    const result = await cacheHandler(makeNode(), makeContext());
    expect(result.updatedVariables?.cache_result).toBe("");
    expect(result.updatedVariables?.cache_result_hit).toBe(false);
    expect(result.nextNodeId).toBe("miss");
  });

  it("routes to 'hit' handle when value found", async () => {
    mockCacheGet.mockResolvedValueOnce("cached_value");

    const result = await cacheHandler(makeNode(), makeContext());
    expect(result.updatedVariables?.cache_result).toBe("cached_value");
    expect(result.updatedVariables?.cache_result_hit).toBe(true);
    expect(result.nextNodeId).toBe("hit");
  });

  it("stores value with set operation", async () => {
    const result = await cacheHandler(
      makeNode({ operation: "set", value: "hello" }),
      makeContext(),
    );
    expect(result.updatedVariables?.cache_result_status).toBe("stored");
    expect(mockCacheSet).toHaveBeenCalled();
  });

  it("deletes value with delete operation", async () => {
    const result = await cacheHandler(
      makeNode({ operation: "delete" }),
      makeContext(),
    );
    expect(result.updatedVariables?.cache_result_status).toBe("deleted");
  });

  it("resolves template variables in cache key", async () => {
    await cacheHandler(
      makeNode({ cacheKey: "{{user_id}}_data" }),
      makeContext({ variables: { user_id: "u123" } }),
    );
    expect(mockCacheGet).toHaveBeenCalledWith(
      expect.stringContaining("u123_data"),
    );
  });
});
