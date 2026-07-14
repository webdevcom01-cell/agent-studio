/**
 * F2-3: Auth + rate-limit guard for /api/collector/* proxy routes.
 *
 * These routes proxy to external paid/limited APIs (Google Places — billed;
 * OSM Overpass — strict fair-use). Without auth they are an open proxy:
 * middleware passes any request carrying an `x-api-key` header through to the
 * route, expecting the route to validate it — so a bogus key bypassed the
 * login gate and the route never checked. This guard closes that hole and
 * caps per-user request volume so the proxy can't be abused as free egress.
 */

import type { NextRequest, NextResponse } from "next/server";
import { NextResponse as Res } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { checkRateLimitAsync } from "@/lib/rate-limit";

// Collector calls fan out to external quota-limited APIs; keep the cap modest.
const COLLECTOR_MAX_PER_MINUTE = 60;

export interface CollectorAuth {
  userId: string;
}

/**
 * Returns a NextResponse (401/429) to short-circuit on, or { userId } when the
 * caller is authenticated and under the rate limit.
 */
export async function guardCollectorRoute(
  req: NextRequest,
  routeKey: string,
): Promise<NextResponse | CollectorAuth> {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth; // 401 (invalid/missing session or API key)

  const rl = await checkRateLimitAsync(
    `collector:${routeKey}:${auth.userId}`,
    COLLECTOR_MAX_PER_MINUTE,
  );
  if (!rl.allowed) {
    return Res.json(
      { success: false, error: "Rate limit exceeded. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  return { userId: auth.userId };
}
