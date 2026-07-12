/**
 * Tests for POST /api/evals/scheduled — cron auth must be FAIL-CLOSED.
 *
 * Key test: in production with CRON_SECRET unset, an unauthenticated
 * request must be rejected (503) and must NOT trigger eval work.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockTriggerScheduledEvals = vi.hoisted(() => vi.fn());
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/evals/schedule-hook", () => ({
  triggerScheduledEvals: mockTriggerScheduledEvals,
}));
vi.mock("@/lib/logger", () => ({ logger: mockLogger }));

import { POST } from "../route";

function makeReq(secret?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (secret) headers["authorization"] = `Bearer ${secret}`;
  return new NextRequest("http://localhost:3000/api/evals/scheduled", {
    method: "POST",
    headers,
  });
}

describe("POST /api/evals/scheduled — cron auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("FAIL-CLOSED: production + CRON_SECRET unset → 503, no eval work", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "");

    const res = await POST(makeReq());

    expect(res.status).toBe(503);
    expect(mockTriggerScheduledEvals).not.toHaveBeenCalled();
  });

  it("returns 401 when CRON_SECRET set and auth header missing", async () => {
    vi.stubEnv("CRON_SECRET", "secret-abc");

    const res = await POST(makeReq());

    expect(res.status).toBe(401);
    expect(mockTriggerScheduledEvals).not.toHaveBeenCalled();
  });

  it("returns 401 when CRON_SECRET set and wrong secret provided", async () => {
    vi.stubEnv("CRON_SECRET", "secret-abc");

    const res = await POST(makeReq("wrong"));

    expect(res.status).toBe(401);
    expect(mockTriggerScheduledEvals).not.toHaveBeenCalled();
  });

  it("returns 200 and triggers evals when correct secret provided", async () => {
    vi.stubEnv("CRON_SECRET", "secret-abc");

    const res = await POST(makeReq("secret-abc"));

    expect(res.status).toBe(200);
    expect(mockTriggerScheduledEvals).toHaveBeenCalledTimes(1);
  });

  it("dev-open: non-production + CRON_SECRET unset → 200 (local testing)", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("CRON_SECRET", "");

    const res = await POST(makeReq());

    expect(res.status).toBe(200);
    expect(mockTriggerScheduledEvals).toHaveBeenCalledTimes(1);
  });
});
