/**
 * Tests for POST /api/cron/evolve
 *
 * Key: verifies that the HITL gate (requestInstinctPromotion) is used,
 * NOT the direct promoteInstinctToSkill bypass.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockAgentFindMany = vi.hoisted(() => vi.fn());
const mockEvolveAgentInstincts = vi.hoisted(() => vi.fn());
const mockRequestInstinctPromotion = vi.hoisted(() => vi.fn());
const mockPromoteInstinctToSkill = vi.hoisted(() => vi.fn()); // must NOT be called
const mockDecayStaleInstincts = vi.hoisted(() => vi.fn());
const mockGenerateText = vi.hoisted(() => vi.fn());
const mockIsECCEnabled = vi.hoisted(() => vi.fn());
const mockGetEnv = vi.hoisted(() => vi.fn());
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agent: { findMany: mockAgentFindMany },
  },
}));

vi.mock("@/lib/ecc/instinct-engine", () => ({
  evolveAgentInstincts: mockEvolveAgentInstincts,
  requestInstinctPromotion: mockRequestInstinctPromotion,
  promoteInstinctToSkill: mockPromoteInstinctToSkill,
  decayStaleInstincts: mockDecayStaleInstincts,
}));

vi.mock("ai", () => ({ generateText: mockGenerateText }));
vi.mock("@/lib/ai", () => ({ getModel: vi.fn().mockReturnValue("deepseek-chat") }));
vi.mock("@/lib/ecc", () => ({ isECCEnabled: mockIsECCEnabled }));
vi.mock("@/lib/env", () => ({ getEnv: mockGetEnv }));
vi.mock("@/lib/logger", () => ({ logger: mockLogger }));

// ─── Import under test ────────────────────────────────────────────────────────

import { POST } from "../route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(secret?: string): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) headers["authorization"] = `Bearer ${secret}`;
  return new NextRequest("http://localhost:3000/api/cron/evolve", {
    method: "POST",
    headers,
  });
}

const MOCK_INSTINCT = {
  id: "inst-1",
  name: "Error handling pattern",
  description: "Always wrap async calls in try/catch",
  confidence: 0.92,
  frequency: 14,
  agentId: "agent-1",
  promotedToSkillId: null,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/cron/evolve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEnv.mockReturnValue({ CRON_SECRET: undefined }); // no secret = skip auth check
    mockIsECCEnabled.mockReturnValue(true);
    mockAgentFindMany.mockResolvedValue([{ id: "agent-1", name: "Test Agent" }]);
    mockEvolveAgentInstincts.mockResolvedValue({
      clusters: [],
      candidates: [{ instinct: MOCK_INSTINCT, skillSlug: "instinct-error-handling-pattern" }],
    });
    mockRequestInstinctPromotion.mockResolvedValue({ approvalRequestId: "approval-1" });
    mockDecayStaleInstincts.mockResolvedValue(0);
    mockGenerateText.mockResolvedValue({ text: "Generated skill content" });
  });

  describe("Auth", () => {
    it("returns 401 when CRON_SECRET set and authorization header missing", async () => {
      mockGetEnv.mockReturnValue({ CRON_SECRET: "secret-abc" });

      const res = await POST(makeReq()); // no Bearer token
      expect(res.status).toBe(401);
    });

    it("returns 401 when CRON_SECRET set and wrong secret provided", async () => {
      mockGetEnv.mockReturnValue({ CRON_SECRET: "secret-abc" });

      const res = await POST(makeReq("wrong-secret"));
      expect(res.status).toBe(401);
    });

    it("passes when correct secret provided", async () => {
      mockGetEnv.mockReturnValue({ CRON_SECRET: "secret-abc" });

      const res = await POST(makeReq("secret-abc"));
      expect(res.status).toBe(200);
    });

    it("passes when no CRON_SECRET is configured", async () => {
      mockGetEnv.mockReturnValue({ CRON_SECRET: undefined });
      const res = await POST(makeReq());
      expect(res.status).toBe(200);
    });
  });

  describe("ECC disabled", () => {
    it("skips processing when ECC is globally disabled", async () => {
      mockIsECCEnabled.mockReturnValue(false);

      const res = await POST(makeReq());
      expect(res.status).toBe(200);
      const body = await res.json() as { success: boolean; data: { skipped: boolean } };
      expect(body.data.skipped).toBe(true);
      expect(mockAgentFindMany).not.toHaveBeenCalled();
    });
  });

  describe("HITL gate — critical regression test", () => {
    it("calls requestInstinctPromotion (HITL), NOT promoteInstinctToSkill", async () => {
      await POST(makeReq());

      // requestInstinctPromotion MUST be called
      expect(mockRequestInstinctPromotion).toHaveBeenCalledWith(
        MOCK_INSTINCT.id,
        "Generated skill content",
      );

      // Direct promotion MUST NOT be called (would bypass human review)
      expect(mockPromoteInstinctToSkill).not.toHaveBeenCalled();
    });

    it("creates one approval request per promotion candidate", async () => {
      mockEvolveAgentInstincts.mockResolvedValue({
        clusters: [],
        candidates: [
          { instinct: MOCK_INSTINCT, skillSlug: "slug-1" },
          {
            instinct: { ...MOCK_INSTINCT, id: "inst-2", name: "Retry pattern" },
            skillSlug: "slug-2",
          },
        ],
      });

      await POST(makeReq());

      expect(mockRequestInstinctPromotion).toHaveBeenCalledTimes(2);
    });
  });

  describe("Happy path", () => {
    it("returns 200 with promotionRequestsCreated count", async () => {
      const res = await POST(makeReq());
      expect(res.status).toBe(200);

      const body = await res.json() as {
        success: boolean;
        data: { agentsProcessed: number; promotionRequestsCreated: number };
      };
      expect(body.success).toBe(true);
      expect(body.data.agentsProcessed).toBe(1);
      expect(body.data.promotionRequestsCreated).toBe(1);
    });

    it("decays stale instincts and includes count in response", async () => {
      mockDecayStaleInstincts.mockResolvedValue(3);

      const res = await POST(makeReq());
      const body = await res.json() as { success: boolean; data: { decayed: number } };
      expect(body.data.decayed).toBe(3);
    });

    it("skips agents with no promotion candidates", async () => {
      mockEvolveAgentInstincts.mockResolvedValue({ clusters: [], candidates: [] });

      const res = await POST(makeReq());
      const body = await res.json() as { data: { promotionRequestsCreated: number } };
      expect(body.data.promotionRequestsCreated).toBe(0);
      expect(mockRequestInstinctPromotion).not.toHaveBeenCalled();
    });
  });

  describe("Error handling", () => {
    it("collects per-agent errors but still processes other agents", async () => {
      mockAgentFindMany.mockResolvedValue([
        { id: "agent-1", name: "Agent 1" },
        { id: "agent-2", name: "Agent 2" },
      ]);
      mockEvolveAgentInstincts
        .mockRejectedValueOnce(new Error("Agent 1 failed"))
        .mockResolvedValueOnce({ clusters: [], candidates: [] });

      const res = await POST(makeReq());
      expect(res.status).toBe(200);
      const body = await res.json() as { data: { errors: unknown[] } };
      expect(body.data.errors).toHaveLength(1);
    });

    it("returns 500 when top-level prisma call fails", async () => {
      mockAgentFindMany.mockRejectedValue(new Error("DB down"));

      const res = await POST(makeReq());
      expect(res.status).toBe(500);
      const body = await res.json() as { success: boolean };
      expect(body.success).toBe(false);
    });
  });
});
