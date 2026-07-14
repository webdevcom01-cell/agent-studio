/**
 * F2-3 integration: /api/collector/overpass must reject unauthenticated
 * callers (was an open proxy) and proxy only for authed callers under limit.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockRequireAuth = vi.hoisted(() => vi.fn());
const mockRateLimit = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/auth-guard", () => ({
  requireAuth: mockRequireAuth,
  isAuthError: (v: unknown) => v instanceof NextResponse,
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitAsync: mockRateLimit }));

import { POST } from "../route";

function makeReq(body: unknown = { query: "[out:json];node(1);out;" }): NextRequest {
  return new NextRequest("http://localhost:3000/api/collector/overpass", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/collector/overpass — F2-3 auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockResolvedValue({ allowed: true, remaining: 59, retryAfterMs: 0 });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ elements: [{ id: 1 }] }),
      }),
    );
  });

  it("unauthenticated → 401, external Overpass NOT called", async () => {
    mockRequireAuth.mockResolvedValue(NextResponse.json({ success: false }, { status: 401 }));

    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("authenticated → proxies to Overpass and returns elements", async () => {
    mockRequireAuth.mockResolvedValue({ userId: "u1" });

    const res = await POST(makeReq());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.elements).toEqual([{ id: 1 }]);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("authenticated but over rate limit → 429, external NOT called", async () => {
    mockRequireAuth.mockResolvedValue({ userId: "u1" });
    mockRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterMs: 1000 });

    const res = await POST(makeReq());
    expect(res.status).toBe(429);
    expect(fetch).not.toHaveBeenCalled();
  });
});
