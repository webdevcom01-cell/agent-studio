import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getEnv } from "@/lib/env";
import { runScheduledFlow } from "@/lib/scheduler/execution-engine";
import type { ScheduleRunResult } from "@/lib/scheduler/execution-engine";

/**
 * POST /api/cron/trigger-scheduled-flows
 *
 * Vercel Cron endpoint — fires every 5 minutes (see vercel.json).
 * Scans for all enabled FlowSchedules with nextRunAt <= now and executes them.
 *
 * Auth: Bearer token from the Authorization header must match CRON_SECRET.
 * In development (CRON_SECRET not set), the check is skipped to allow local testing.
 *
 * Safety properties:
 *   - Idempotency: each schedule+tick has a unique key — duplicate runs are SKIPPED
 *   - Circuit breaker: schedules auto-disable after maxRetries consecutive failures
 *   - Per-schedule error isolation: one failure never blocks the rest of the batch
 *   - maxDuration = 300s (Vercel Pro limit): handles large batches safely
 */

export const maxDuration = 300;

// Maximum schedules processed per cron invocation — prevents overlong runs
const MAX_SCHEDULES_PER_RUN = 100;

// ─── Auth guard ───────────────────────────────────────────────────────────────

function isCronAuthorized(request: NextRequest): boolean {
  const env = getEnv();
  const secret = env.CRON_SECRET;

  // Dev mode: skip auth when secret is not configured
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      logger.warn("CRON_SECRET not set in production — cron endpoint is unprotected");
    }
    return true;
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;

  // Vercel sets: Authorization: Bearer <CRON_SECRET>
  const [scheme, token] = authHeader.split(" ");
  return scheme === "Bearer" && token === secret;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const invocationTime = new Date();

  // ── Auth ────────────────────────────────────────────────────────────────
  if (!isCronAuthorized(request)) {
    logger.warn("Cron endpoint: unauthorized request", {
      ip: request.headers.get("x-forwarded-for") ?? "unknown",
    });
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  logger.info("Cron: scanning for due schedules", {
    invocationTime: invocationTime.toISOString(),
  });

  // ── Query due schedules ─────────────────────────────────────────────────
  let dueSchedules;
  try {
    dueSchedules = await prisma.flowSchedule.findMany({
      where: {
        enabled: true,
        nextRunAt: { lte: invocationTime },
        // Exclude MANUAL schedules — they have no automatic trigger
        scheduleType: { not: "MANUAL" },
      },
      orderBy: { nextRunAt: "asc" },
      take: MAX_SCHEDULES_PER_RUN,
    });
  } catch (err) {
    logger.error("Cron: DB query failed", err instanceof Error ? err : new Error(String(err)));
    return NextResponse.json(
      { success: false, error: "Database query failed" },
      { status: 500 },
    );
  }

  logger.info(`Cron: found ${dueSchedules.length} due schedules`);

  if (dueSchedules.length === 0) {
    return NextResponse.json({
      success: true,
      data: { processed: 0, failed: 0, skipped: 0, total: 0 },
    });
  }

  // ── Execute schedules — per-schedule error isolation ───────────────────
  const results: ScheduleRunResult[] = [];
  let failed = 0;
  let skipped = 0;

  for (const schedule of dueSchedules) {
    try {
      const result = await runScheduledFlow(schedule);
      results.push(result);

      if (result.status === "FAILED") failed++;
      if (result.status === "SKIPPED") skipped++;
    } catch (err) {
      // Unexpected error — log and continue
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Cron: unexpected error executing schedule", err instanceof Error ? err : new Error(message), {
        scheduleId: schedule.id,
        agentId: schedule.agentId,
      });
      failed++;
      results.push({
        scheduleId: schedule.id,
        executionId: "unknown",
        status: "FAILED",
        durationMs: 0,
        error: message,
      });
    }
  }

  const processed = results.filter((r) => r.status === "COMPLETED").length;

  logger.info("Cron: batch complete", {
    total: dueSchedules.length,
    processed,
    failed,
    skipped,
  });

  return NextResponse.json({
    success: true,
    data: {
      total: dueSchedules.length,
      processed,
      failed,
      skipped,
    },
  });
}
