import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFindMany, mockUpsert, mockDeleteMany } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockUpsert: vi.fn(),
  mockDeleteMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    heartbeatContext: {
      findMany: mockFindMany,
      upsert: mockUpsert,
      deleteMany: mockDeleteMany,
    },
  },
}));

vi.mock("@/generated/prisma", () => ({
  Prisma: {
    InputJsonValue: {},
  },
}));

import { getContext, setContext, pruneContext, buildContextPrompt } from "../context-manager";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getContext", () => {
  it("returns empty object when no context items exist", async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await getContext("agent-1");

    expect(result).toEqual({});
  });

  it("returns key-value map of non-expired items", async () => {
    mockFindMany.mockResolvedValue([
      { key: "last_id", value: 42 },
      { key: "state", value: { phase: "active" } },
    ]);

    const result = await getContext("agent-1");

    expect(result).toEqual({ last_id: 42, state: { phase: "active" } });
  });

  it("excludes expired items via DB-level filter", async () => {
    mockFindMany.mockResolvedValue([{ key: "active_key", value: "ok" }]);

    const result = await getContext("agent-1");

    // Confirm the query passed the expiry filter
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          agentId: "agent-1",
          OR: expect.arrayContaining([{ expiresAt: null }]),
        }),
      }),
    );
    expect(result).toEqual({ active_key: "ok" });
  });
});

describe("setContext", () => {
  it("calls upsert with correct data when no ttl provided", async () => {
    mockUpsert.mockResolvedValue({});

    await setContext("agent-1", "org-1", "summary", "done 42 tasks");

    expect(mockUpsert).toHaveBeenCalledOnce();
    const call = mockUpsert.mock.calls[0][0] as Record<string, unknown>;
    expect((call.create as Record<string, unknown>).key).toBe("summary");
    expect((call.create as Record<string, unknown>).agentId).toBe("agent-1");
    expect((call.create as Record<string, unknown>).expiresAt).toBeNull();
  });

  it("calculates expiresAt correctly when ttlSeconds provided", async () => {
    mockUpsert.mockResolvedValue({});
    const before = Date.now();

    await setContext("agent-1", "org-1", "temp_key", "value", 3600);

    const call = mockUpsert.mock.calls[0][0] as Record<string, unknown>;
    const expiresAt = (call.create as Record<string, unknown>).expiresAt as Date;
    expect(expiresAt).toBeInstanceOf(Date);
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 3600 * 1000 - 100);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(before + 3600 * 1000 + 100);
  });
});

describe("pruneContext", () => {
  it("calls deleteMany with expiresAt < now and returns count", async () => {
    mockDeleteMany.mockResolvedValue({ count: 3 });

    const count = await pruneContext("agent-1");

    expect(count).toBe(3);
    expect(mockDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          agentId: "agent-1",
          expiresAt: expect.objectContaining({ lt: expect.any(Date) }),
        }),
      }),
    );
  });
});

describe("buildContextPrompt", () => {
  it("returns empty string when no context items", async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await buildContextPrompt("agent-1");

    expect(result).toBe("");
  });

  it("formats context correctly with header and items", async () => {
    mockFindMany.mockResolvedValue([
      { key: "last_processed_id", value: 12345 },
      { key: "summary", value: "Processed 42 new orders" },
      { key: "state", value: { phase: "monitoring" } },
    ]);

    const result = await buildContextPrompt("agent-1");

    expect(result).toContain("--- Agent Memory (from previous heartbeat runs) ---");
    expect(result).toContain("last_processed_id: 12345");
    expect(result).toContain('summary: "Processed 42 new orders"');
    expect(result).toContain('state: {"phase":"monitoring"}');
    expect(result).toContain("---");
  });
});
