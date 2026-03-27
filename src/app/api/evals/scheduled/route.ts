import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { triggerScheduledEvals } from "@/lib/evals/schedule-hook";

/**
 * POST /api/evals/scheduled
 *
 * Cron-triggered endpoint: checks all schedule-enabled eval suites and runs
 * any that are due according to their cron expression.
 *
 * Security: protected by CRON_SECRET header (same pattern as /api/ecc/ingest-skills).
 * Called by the Railway Cron Service every 5 minutes alongside existing scheduled flows.
 *
 * This endpoint returns immediately — all eval work is fire-and-forget.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Verify CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    const providedSecret = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : request.headers.get("x-cron-secret");

    if (providedSecret !== cronSecret) {
      logger.warn("scheduled-evals: unauthorized cron request");
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }
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
