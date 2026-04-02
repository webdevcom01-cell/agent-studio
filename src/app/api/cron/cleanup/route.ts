/**
 * POST /api/cron/cleanup
 *
 * 1. Deletes ARCHIVED FlowVersions older than 90 days.
 *    PUBLISHED and DRAFT versions are never deleted.
 *
 * 2. Resets KBSources stuck in PROCESSING for more than 10 minutes back to
 *    FAILED, so users can retry. This covers cases where the ingest worker
 *    crashed mid-run without updating the status.
 *
 * Supports ?dryRun=true for preview without deletion/mutation.
 * Protected by CRON_SECRET header.
 * Recommended: run weekly via Railway Cron Service.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getEnv } from "@/lib/env";
import { VersionService } from "@/lib/versioning/version-service";
import { resetStuckSources } from "@/lib/knowledge/maintenance";
import { recordMetric } from "@/lib/observability/metrics";

const DEFAULT_RETENTION_DAYS = 90;
const DEFAULT_STUCK_MINUTES = 10;

function verifyCronSecret(req: NextRequest): boolean {
  const env = getEnv();
  const cronSecret = env.CRON_SECRET;
  if (!cronSecret) return true;

  const authHeader = req.headers.get("authorization") ?? "";
  return authHeader === `Bearer ${cronSecret}`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!verifyCronSecret(req)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const dryRun = searchParams.get("dryRun") === "true";
    const retentionDays = Math.max(
      1,
      parseInt(searchParams.get("retentionDays") ?? "", 10) || DEFAULT_RETENTION_DAYS
    );
    const stuckMinutes = Math.max(
      1,
      parseInt(searchParams.get("stuckMinutes") ?? "", 10) || DEFAULT_STUCK_MINUTES
    );

    // ── 1. FlowVersion cleanup ───────────────────────────────────────────
    const versionsResult = await VersionService.cleanupArchivedVersions(
      retentionDays,
      dryRun
    );

    if (!dryRun && versionsResult.deleted > 0) {
      recordMetric("flow_version.cleanup.deleted", versionsResult.deleted, "count", {
        retentionDays,
      });
    }

    logger.info("FlowVersion cleanup job", {
      deleted: versionsResult.deleted,
      dryRun: versionsResult.dryRun,
      retentionDays,
    });

    // ── 2. Stuck KB source reset ─────────────────────────────────────────
    const stuckResult = dryRun
      ? { resetCount: 0, sourceIds: [] as string[] }
      : await resetStuckSources(stuckMinutes);

    if (!dryRun && stuckResult.resetCount > 0) {
      recordMetric("kb_source.stuck.reset", stuckResult.resetCount, "count", {
        stuckMinutes,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        versions: versionsResult,
        stuckSources: stuckResult,
        dryRun,
      },
    });
  } catch (error) {
    logger.error("Cleanup cron job failed", error, {});
    return NextResponse.json(
      { success: false, error: "Cleanup failed" },
      { status: 500 }
    );
  }
}
