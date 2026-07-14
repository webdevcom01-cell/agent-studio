/**
 * F2-3 tests: collector routes must require auth + enforce rate limit.
 * Unauthenticated → 401; authed over limit → 429; authed under limit → pass.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockRequireAuth = vi.hoisted(() => vi.fn());
const mockIsAuthError = vi.hoisted(() => vi.fn());
const mockRateLimit = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/auth-guard", () => ({
  requireAuth: mockRequireAuth,
  isAuthError: mockIsAuthError,
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitAsync: mockRateLimit }));

import { guardCollectorRoute } from "../collector-guard";

function req(): NextRequest {
  return new NextRequest("http://localhost:3000/api/collector/places", { method: "POST" });
}

describe("F2-3: guardCollectorRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthError.mockImplementation((v: unknown) => v instanceof NextResponse);
    mockRateLimit.mockResolvedValue({ allowed: true, remaining: 59, retryAfterMs: 0 });
  });

  it("unauthenticated → returns the 401 NextResponse (never proxies)", async () => {
    const unauth = NextResponse.json({ success: false }, { status: 401 });
    mockRequireAuth.mockResolvedValue(unauth);

    const r = await guardCollectorRoute(req(), "places");
    expect(r).toBeInstanceOf(NextResponse);
    expect((r as NextResponse).status).toBe(401);
    expect(mockRateLimit).not.toHaveBeenCalled();
  });

  it("authenticated + under limit → { userId }, rate key scoped to user+route", async () => {
    mockRequireAuth.mockResolvedValue({ userId: "u1" });

    const r = await guardCollectorRoute(req(), "places");
    expect(r).toEqual({ userId: "u1" });
    expect(mockRateLimit).toHaveBeenCalledWith("collector:places:u1", 60);
  });

  it("authenticated + over limit → 429 with Retry-After", async () => {
    mockRequireAuth.mockResolvedValue({ userId: "u1" });
    mockRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterMs: 4200 });

    const r = await guardCollectorRoute(req(), "overpass");
    expect(r).toBeInstanceOf(NextResponse);
    const res = r as NextResponse;
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("5");
  });
});
