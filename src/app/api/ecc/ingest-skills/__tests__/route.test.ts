/**
 * Tests for POST /api/ecc/ingest-skills — cron auth must be FAIL-CLOSED.
 *
 * Key test: in production with CRON_SECRET unset, an unauthenticated
 * request must be rejected (503) and must NOT ingest anything.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockParseSkillMd = vi.hoisted(() => vi.fn());
const mockSlugify = vi.hoisted(() => vi.fn((s: string) => s));
const mockIngestSkills = vi.hoisted(() => vi.fn());
const mockVectorizeSkills = vi.hoisted(() => vi.fn());
const mockGetEnv = vi.hoisted(() => vi.fn());
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/ecc", () => ({
  parseSkillMd: mockParseSkillMd,
  slugify: mockSlugify,
  ingestSkills: mockIngestSkills,
  vectorizeSkills: mockVectorizeSkills,
}));
vi.mock("@/lib/env", () => ({ getEnv: mockGetEnv }));
vi.mock("@/lib/logger", () => ({ logger: mockLogger }));

import { POST } from "../route";

const VALID_BODY = {
  skills: [{ slug: "test-skill", content: "# Test Skill\ncontent here" }],
};

function makeReq(secret?: string): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) headers["authorization"] = `Bearer ${secret}`;
  return new NextRequest("http://localhost:3000/api/ecc/ingest-skills", {
    method: "POST",
    headers,
    body: JSON.stringify(VALID_BODY),
  });
}

describe("POST /api/ecc/ingest-skills — cron auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    // getEnv() mirrors process.env so vi.stubEnv controls both auth paths
    mockGetEnv.mockImplementation(() => ({
      CRON_SECRET: process.env.CRON_SECRET || undefined,
    }));
    mockParseSkillMd.mockReturnValue({ slug: "test-skill" });
    mockIngestSkills.mockResolvedValue({ created: 1, updated: 0 });
  });

  it("FAIL-CLOSED: production + CRON_SECRET unset → 503, nothing ingested", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "");

    const res = await POST(makeReq());

    expect(res.status).toBe(503);
    expect(mockIngestSkills).not.toHaveBeenCalled();
  });

  it("returns 401 when CRON_SECRET set and auth header missing", async () => {
    vi.stubEnv("CRON_SECRET", "secret-abc");

    const res = await POST(makeReq());

    expect(res.status).toBe(401);
    expect(mockIngestSkills).not.toHaveBeenCalled();
  });

  it("returns 401 when CRON_SECRET set and wrong secret provided", async () => {
    vi.stubEnv("CRON_SECRET", "secret-abc");

    const res = await POST(makeReq("wrong"));

    expect(res.status).toBe(401);
    expect(mockIngestSkills).not.toHaveBeenCalled();
  });

  it("returns 200 and ingests when correct secret provided", async () => {
    vi.stubEnv("CRON_SECRET", "secret-abc");

    const res = await POST(makeReq("secret-abc"));

    expect(res.status).toBe(200);
    expect(mockIngestSkills).toHaveBeenCalledTimes(1);
  });

  it("dev-open: non-production + CRON_SECRET unset → 200 (local testing)", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("CRON_SECRET", "");

    const res = await POST(makeReq());

    expect(res.status).toBe(200);
    expect(mockIngestSkills).toHaveBeenCalledTimes(1);
  });
});
