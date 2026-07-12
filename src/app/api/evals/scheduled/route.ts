import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { triggerScheduledEvals } from "@/lib/evals/schedule-hook";
import { requireCronSecret } from "@/lib/api/auth-guard";

/**
 * POST /api/evals/scheduled
 *
 * Cron-triggered endpoint: checks all schedule-enabled eval suites and runs
 * any that are due according to their cron expression.
 *
 * Security: protected by requireCronSecret (fail-closed in production —
 * 503 when CRON_SECRET is not configured; dev-open only outside production).
 * Called by the Railway Cron Service every 5 minutes alongside existing scheduled flows.
 *
 * This endpoint returns immediately — all eval work is fire-and-forget.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Fail-closed cron auth (F1.1): 503 in production when CRON_SECRET unset,
  // 401 on missing/wrong Bearer token. Never falls through unauthenticated.
  const authError = requireCronSecret(request);
  if (authError) {
    logger.warn("scheduled-evals: unauthorized cron request");
    return authError;
  }

  // Determine base URL for internal chat API calls
  const host = request.headers.get("host") ?? "localhost:3000";
  const protocol = request.headers.get("x-forwarded-proto") ?? "http";
  const baseUrl = `${protocol}://${host}`;

  // Forward auth cookie so internal chat calls are authenticated
  const cookieHeader = request.headers.get("cookie") ?? undefined;

  logger.info("scheduled-evals: cron trigger received", { baseUrl });

  // Fire-and-forget — returns before eval work starts
  triggerScheduledEvals({ baseUrl, authHeader: cookieHeader });

  return NextResponse.json(
    { success: true, data: { message: "Scheduled eval check triggered" } },
    { status: 200 },
  );
}
