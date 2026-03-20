/**
 * POST /api/cron/cleanup
 *
 * Deletes ARCHIVED FlowVersions older than 90 days.
 * PUBLISHED and DRAFT versions are never deleted.
 * Supports ?dryRun=true for preview without deletion.
 *
 * Protected by CRON_SECRET header.
 * Recommended: run weekly via Railway Cron Service.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getEnv } from "@/lib/env";
import { VersionService } from "@/lib/versioning/version-service";
import { recordMetric } from "@/lib/observability/metrics";

const DEFAULT_RETENTION_DAYS = 90;

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

    const result = await VersionService.cleanupArchivedVersions(
      retentionDays,
      dryRun
    );

    if (!dryRun && result.deleted > 0) {
      recordMetric("flow_version.cleanup.deleted", result.deleted, "count", {
        retentionDays,
      });
    }

    logger.info("FlowVersion cleanup job", {
      deleted: result.deleted,
      dryRun: result.dryRun,
      retentionDays,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    logger.error("FlowVersion cleanup failed", error, {});
    return NextResponse.json(
      { success: false, error: "Cleanup failed" },
      { status: 500 }
    );
  }
}
