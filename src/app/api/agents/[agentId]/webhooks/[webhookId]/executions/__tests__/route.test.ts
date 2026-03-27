import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    webhookConfig: { findFirst: vi.fn() },
    webhookExecution: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/api/auth-guard", () => ({
  requireAgentOwner: vi.fn().mockResolvedValue({ userId: "user-1", agentId: "agent-1" }),
  isAuthError: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/api/security-headers", () => ({
  applySecurityHeaders: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { GET } from "../route";

const db = prisma as unknown as {
  webhookConfig: { findFirst: ReturnType<typeof vi.fn> };
  webhookExecution: {
    count: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeParams(agentId = "agent-1", webhookId = "wh-1") {
  return Promise.resolve({ agentId, webhookId });
}

function makeRequest(query: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/test");
  Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url);
}

function makeExecution(id: string, status = "COMPLETED") {
  return {
    id,
    status,
    triggeredAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: 120,
    eventType: "push",
    sourceIp: "1.2.3.4",
    conversationId: null,
    errorMessage: null,
    isReplay: false,
    replayOf: null,
    createdAt: new Date().toISOString(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/agents/[agentId]/webhooks/[webhookId]/executions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.webhookConfig.findFirst.mockResolvedValue({ id: "wh-1" });
  });

  describe("basic pagination", () => {
    it("returns first page of executions with hasMore=false when count ≤ limit", async () => {
      const execs = [makeExecution("exec-1"), makeExecution("exec-2")];
      db.webhookExecution.count.mockResolvedValue(2);
      db.webhookExecution.findMany.mockResolvedValue(execs);

      const res = await GET(makeRequest(), { params: makeParams() });
      const json = await res.json() as { success: boolean; data: unknown[]; hasMore: boolean; total: number; nextCursor: unknown };

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(2);
      expect(json.hasMore).toBe(false);
      expect(json.nextCursor).toBeNull();
      expect(json.total).toBe(2);
    });

    it("sets hasMore=true and returns nextCursor when more items exist", async () => {
      // Request limit=2, findMany returns limit+1=3 items
      const execs = [makeExecution("exec-1"), makeExecution("exec-2"), makeExecution("exec-3")];
      db.webhookExecution.count.mockResolvedValue(10);
      db.webhookExecution.findMany.mockResolvedValue(execs);

      const res = await GET(makeRequest({ limit: "2" }), { params: makeParams() });
      const json = await res.json() as { success: boolean; data: unknown[]; hasMore: boolean; nextCursor: string };

      expect(json.data).toHaveLength(2); // sliced to limit
      expect(json.hasMore).toBe(true);
      expect(json.nextCursor).toBe("exec-2"); // last item in sliced data
    });

    it("passes cursor as id lt filter to Prisma", async () => {
      db.webhookExecution.count.mockResolvedValue(5);
      db.webhookExecution.findMany.mockResolvedValue([makeExecution("exec-5")]);

      await GET(makeRequest({ cursor: "exec-3" }), { params: makeParams() });

      const call = db.webhookExecution.findMany.mock.calls[0]?.[0] as { where?: { id?: unknown } };
      expect(call?.where).toMatchObject({ id: { lt: "exec-3" } });
    });

    it("respects custom limit parameter", async () => {
      db.webhookExecution.count.mockResolvedValue(100);
      db.webhookExecution.findMany.mockResolvedValue(
        Array.from({ length: 6 }, (_, i) => makeExecution(`exec-${i}`))
      );

      await GET(makeRequest({ limit: "5" }), { params: makeParams() });

      const call = db.webhookExecution.findMany.mock.calls[0]?.[0] as { take?: number };
      expect(call?.take).toBe(6); // limit + 1
    });

    it("clamps limit to max 50", async () => {
      db.webhookExecution.count.mockResolvedValue(0);
      db.webhookExecution.findMany.mockResolvedValue([]);

      const res = await GET(makeRequest({ limit: "999" }), { params: makeParams() });
      expect(res.status).toBe(422);
    });
  });

  describe("status filtering", () => {
    it("passes no status filter when status=ALL (default)", async () => {
      db.webhookExecution.count.mockResolvedValue(0);
      db.webhookExecution.findMany.mockResolvedValue([]);

      await GET(makeRequest(), { params: makeParams() });

      const countCall = db.webhookExecution.count.mock.calls[0]?.[0] as { where?: Record<string, unknown> };
      expect(countCall?.where).not.toHaveProperty("status");
    });

    it("passes status filter when status=FAILED", async () => {
      db.webhookExecution.count.mockResolvedValue(3);
      db.webhookExecution.findMany.mockResolvedValue([
        makeExecution("exec-1", "FAILED"),
        makeExecution("exec-2", "FAILED"),
        makeExecution("exec-3", "FAILED"),
      ]);

      await GET(makeRequest({ status: "FAILED" }), { params: makeParams() });

      const countCall = db.webhookExecution.count.mock.calls[0]?.[0] as { where?: Record<string, unknown> };
      expect(countCall?.where).toMatchObject({ status: "FAILED" });
    });

    it("rejects invalid status values", async () => {
      const res = await GET(makeRequest({ status: "INVALID" }), { params: makeParams() });
      expect(res.status).toBe(422);
    });

    it("accepts all valid status values", async () => {
      const validStatuses = ["ALL", "COMPLETED", "FAILED", "RUNNING", "SKIPPED"];
      db.webhookExecution.count.mockResolvedValue(0);
      db.webhookExecution.findMany.mockResolvedValue([]);

      for (const status of validStatuses) {
        vi.clearAllMocks();
        db.webhookConfig.findFirst.mockResolvedValue({ id: "wh-1" });
        db.webhookExecution.count.mockResolvedValue(0);
        db.webhookExecution.findMany.mockResolvedValue([]);

        const res = await GET(makeRequest({ status }), { params: makeParams() });
        expect(res.status).toBe(200);
      }
    });
  });

  describe("error handling", () => {
    it("returns 404 when webhook not found", async () => {
      db.webhookConfig.findFirst.mockResolvedValue(null);

      const res = await GET(makeRequest(), { params: makeParams() });
      expect(res.status).toBe(404);
    });

    it("returns 500 on Prisma error", async () => {
      db.webhookExecution.count.mockRejectedValue(new Error("DB error"));

      const res = await GET(makeRequest(), { params: makeParams() });
      expect(res.status).toBe(500);
    });

    it("does not expose rawPayload in response", async () => {
      const execWithPayload = {
        ...makeExecution("exec-1"),
        rawPayload: '{"secret": "value"}',
      };
      db.webhookExecution.count.mockResolvedValue(1);
      db.webhookExecution.findMany.mockResolvedValue([execWithPayload]);

      const res = await GET(makeRequest(), { params: makeParams() });
      const json = await res.json() as { data: Array<Record<string, unknown>> };

      // rawPayload must not be in the select — Prisma mock returns what we give it,
      // but the actual route's select clause excludes rawPayload.
      // Test that select is called without rawPayload field:
      const findManyCall = db.webhookExecution.findMany.mock.calls[0]?.[0] as { select?: Record<string, unknown> };
      expect(findManyCall?.select).not.toHaveProperty("rawPayload");
    });
  });

  describe("response shape", () => {
    it("returns required fields: data, nextCursor, total, hasMore", async () => {
      db.webhookExecution.count.mockResolvedValue(1);
      db.webhookExecution.findMany.mockResolvedValue([makeExecution("exec-1")]);

      const res = await GET(makeRequest(), { params: makeParams() });
      const json = await res.json() as Record<string, unknown>;

      expect(json).toHaveProperty("success", true);
      expect(json).toHaveProperty("data");
      expect(json).toHaveProperty("nextCursor");
      expect(json).toHaveProperty("total");
      expect(json).toHaveProperty("hasMore");
    });
  });
});
