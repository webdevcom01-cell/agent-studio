/**
 * POST /api/schedules/preview
 *
 * Lightweight endpoint used by the property panel to generate a live
 * human-readable cron preview and next 3 run times.
 *
 * No auth required — returns only computed text, no DB access.
 * Body: CronPreviewRequest { scheduleType, cronExpression?, intervalMinutes?, timezone }
 * Response: CronPreview { description, nextRuns, valid, error? }
 */

import { NextRequest, NextResponse } from "next/server";
import { CronPreviewRequestSchema } from "@/lib/scheduler/schemas";
import { buildCronPreview } from "@/lib/scheduler/cron-validator";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => ({}));
  const parsed = CronPreviewRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { valid: false, error: parsed.error.errors[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const preview = buildCronPreview(parsed.data);
  return NextResponse.json(preview);
}
