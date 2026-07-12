/**
 * Tests for POST /api/skills/evolve — cron auth must be FAIL-CLOSED.
 *
 * Key test: in production with CRON_SECRET unset, an unauthenticated
 * request must be rejected (503) and must NOT run promotion logic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetPromotionCandidates = vi.hoisted(() => vi.fn());
const mockRequestInstinctPromotion = vi.hoisted(() => vi.fn());
const mockDecayStaleInstincts = vi.hoisted(() => vi.fn());
const mockGenerateText = vi.hoisted(() => vi.fn());
const mockGetEnv = vi.hoisted(() => vi.fn());
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/ecc/instinct-engine", () => ({
  getPromotionCandidates: mockGetPromotionCandidates,
  requestInstinctPromotion: mockRequestInstinctPromotion,
  decayStaleInstincts: mockDecayStaleInstincts,
}));
vi.mock("ai", () => ({ generateText: mockGenerateText }));
vi.mock("@/lib/ai", () => ({ getModel: vi.fn().mockReturnValue("model") }));
vi.mock("@/lib/env", () => ({ getEnv: mockGetEnv }));
vi.mock("@/lib/logger", () => ({ logger: mockLogger }));

import { POST } from "../route";

function makeReq(secret?: string): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) headers["authorization"] = `Bearer ${secret}`;
  return new NextRequest("http://localhost:3000/api/skills/evolve", {
    method: "POST",
    headers,
    body: JSON.stringify({ dryRun: true }),
  });
}

describe("POST /api/skills/evolve — cron auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    // getEnv() mirrors process.env so vi.stubEnv controls both auth paths
    mockGetEnv.mockImplementation(() => ({
      CRON_SECRET: process.env.CRON_SECRET || undefined,
    }));
    mockGetPromotionCandidates.mockResolvedValue([]);
    mockDecayStaleInstincts.mockResolvedValue(0);
  });

  it("FAIL-CLOSED: production + CRON_SECRET unset → 503, no promotion work", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "");

    const res = await POST(makeReq());

    expect(res.status).toBe(503);
    expect(mockGetPromotionCandidates).not.toHaveBeenCalled();
  });

  it("returns 401 when CRON_SECRET set and auth header missing", async () => {
    vi.stubEnv("CRON_SECRET", "secret-abc");

    const res = await POST(makeReq());

    expect(res.status).toBe(401);
    expect(mockGetPromotionCandidates).not.toHaveBeenCalled();
  });

  it("returns 401 when CRON_SECRET set and wrong secret provided", async () => {
    vi.stubEnv("CRON_SECRET", "secret-abc");

    const res = await POST(makeReq("wrong"));

    expect(res.status).toBe(401);
    expect(mockGetPromotionCandidates).not.toHaveBeenCalled();
  });

  it("returns 200 when correct secret provided", async () => {
    vi.stubEnv("CRON_SECRET", "secret-abc");

    const res = await POST(makeReq("secret-abc"));

    expect(res.status).toBe(200);
    expect(mockGetPromotionCandidates).toHaveBeenCalledTimes(1);
  });

  it("dev-open: non-production + CRON_SECRET unset → 200 (local testing)", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("CRON_SECRET", "");

    const res = await POST(makeReq());

    expect(res.status).toBe(200);
  });
});
