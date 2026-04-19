/**
 * Tests for GET /api/agents/[agentId]/instincts
 *
 * Covers:
 *   1. Auth guard enforced — 401/403 returned on failure
 *   2. Agent not found — returns 404
 *   3. Happy path — returns eccEnabled, stats, candidates, instincts
 *   4. Prisma failure — returns 500
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockAgentFindUnique = vi.hoisted(() => vi.fn());
const mockInstinctFindMany = vi.hoisted(() => vi.fn());

const mockRequireAgentOwner = vi.hoisted(() => vi.fn());
const mockIsAuthError = vi.hoisted(() => vi.fn());

const mockGetLifecycleStats = vi.hoisted(() => vi.fn());
const mockGetPromotionCandidates = vi.hoisted(() => vi.fn());

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agent: { findUnique: mockAgentFindUnique },
    instinct: { findMany: mockInstinctFindMany },
  },
}));

vi.mock("@/lib/api/auth-guard", () => ({
  requireAgentOwner: mockRequireAgentOwner,
  isAuthError: mockIsAuthError,
}));

vi.mock("@/lib/ecc/instinct-engine", () => ({
  getLifecycleStats: mockGetLifecycleStats,
  getPromotionCandidates: mockGetPromotionCandidates,
}));

vi.mock("@/lib/logger", () => ({ logger: mockLogger }));

// ─── Import under test ────────────────────────────────────────────────────────

import { GET } from "../route";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const AGENT_ID = "agent-abc";

const MOCK_STATS = {
  total: 3,
  byConfidenceBucket: { "0.8-1.0": 2, "0.6-0.8": 1 },
  promotionReady: 2,
  promoted: 0,
  decaying: 0,
  averageConfidence: 0.88,
  averageFrequency: 12,
};

const MOCK_CANDIDATES = [
  {
    instinct: {
      id: "inst-1",
      name: "Error handling pattern",
      description: "Always wrap async calls",
      confidence: 0.9,
      frequency: 15,
      agentId: AGENT_ID,
      promotedToSkillId: null,
    },
    skillSlug: "instinct-error-handling-pattern",
  },
];

const MOCK_INSTINCTS = [
  {
    id: "inst-1",
    name: "Error handling pattern",
    description: "Always wrap async calls",
    confidence: 0.9,
    frequency: 15,
    promotedToSkillId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

function makeReq(): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/agents/${AGENT_ID}/instincts`,
    { method: "GET" },
  );
}

function makeParams(): { params: Promise<{ agentId: string }> } {
  return { params: Promise.resolve({ agentId: AGENT_ID }) };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/agents/[agentId]/instincts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: auth passes
    mockRequireAgentOwner.mockResolvedValue({ userId: "user-1", agentId: AGENT_ID });
    mockIsAuthError.mockReturnValue(false);
    // Default: agent exists with ECC enabled
    mockAgentFindUnique.mockResolvedValue({ id: AGENT_ID, eccEnabled: true });
    // Default: data returns
    mockGetLifecycleStats.mockResolvedValue(MOCK_STATS);
    mockGetPromotionCandidates.mockResolvedValue(MOCK_CANDIDATES);
    mockInstinctFindMany.mockResolvedValue(MOCK_INSTINCTS);
  });

  describe("Auth guard", () => {
    it("returns auth error response when user is not agent owner", async () => {
      const authError = new Response(
        JSON.stringify({ success: false, error: "Forbidden" }),
        { status: 403 },
      );
      mockRequireAgentOwner.mockResolvedValue(authError);
      mockIsAuthError.mockReturnValue(true);

      const res = await GET(makeReq(), makeParams());
      expect(res.status).toBe(403);
    });
  });

  describe("404 — agent not found", () => {
    it("returns 404 when agent does not exist", async () => {
      mockAgentFindUnique.mockResolvedValue(null);

      const res = await GET(makeReq(), makeParams());
      expect(res.status).toBe(404);
      const body = await res.json() as { success: boolean; error: string };
      expect(body.success).toBe(false);
      expect(body.error).toContain("not found");
    });
  });

  describe("Happy path (200)", () => {
    it("returns eccEnabled, stats, promotion candidates and instincts", async () => {
      const res = await GET(makeReq(), makeParams());
      expect(res.status).toBe(200);

      const body = await res.json() as {
        success: boolean;
        data: {
          eccEnabled: boolean;
          stats: typeof MOCK_STATS;
          promotionCandidates: typeof MOCK_CANDIDATES;
          instincts: typeof MOCK_INSTINCTS;
        };
      };

      expect(body.success).toBe(true);
      expect(body.data.eccEnabled).toBe(true);
      expect(body.data.stats.total).toBe(3);
      expect(body.data.promotionCandidates).toHaveLength(1);
      expect(body.data.instincts).toHaveLength(1);
    });

    it("passes agentId to all ECC functions", async () => {
      await GET(makeReq(), makeParams());

      expect(mockGetLifecycleStats).toHaveBeenCalledWith(AGENT_ID);
      expect(mockGetPromotionCandidates).toHaveBeenCalledWith(AGENT_ID);
      expect(mockInstinctFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { agentId: AGENT_ID } }),
      );
    });

    it("reflects eccEnabled=false when ECC is off for the agent", async () => {
      mockAgentFindUnique.mockResolvedValue({ id: AGENT_ID, eccEnabled: false });

      const res = await GET(makeReq(), makeParams());
      const body = await res.json() as { success: boolean; data: { eccEnabled: boolean } };
      expect(body.data.eccEnabled).toBe(false);
    });

    it("returns empty instincts/stats when agent has no data yet", async () => {
      mockGetLifecycleStats.mockResolvedValue({
        total: 0,
        byConfidenceBucket: {},
        promotionReady: 0,
        promoted: 0,
        decaying: 0,
        averageConfidence: 0,
        averageFrequency: 0,
      });
      mockGetPromotionCandidates.mockResolvedValue([]);
      mockInstinctFindMany.mockResolvedValue([]);

      const res = await GET(makeReq(), makeParams());
      const body = await res.json() as { success: boolean; data: { stats: { total: number } } };
      expect(body.success).toBe(true);
      expect(body.data.stats.total).toBe(0);
    });
  });

  describe("Error handling (500)", () => {
    it("returns 500 when prisma throws", async () => {
      mockAgentFindUnique.mockRejectedValue(new Error("DB error"));

      const res = await GET(makeReq(), makeParams());
      expect(res.status).toBe(500);
      const body = await res.json() as { success: boolean; error: string };
      expect(body.success).toBe(false);
      expect(body.error).not.toContain("DB error"); // no internal leak
    });

    it("returns 500 when instinct-engine throws", async () => {
      mockGetLifecycleStats.mockRejectedValue(new Error("ECC engine error"));

      const res = await GET(makeReq(), makeParams());
      expect(res.status).toBe(500);
    });

    it("logs the error on failure", async () => {
      mockAgentFindUnique.mockRejectedValue(new Error("boom"));

      await GET(makeReq(), makeParams());
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
