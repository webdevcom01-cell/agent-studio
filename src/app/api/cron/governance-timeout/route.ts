import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { addGovernanceTimeoutJob } from "@/lib/queue";
import { requireCronSecret } from "@/lib/api/auth-guard";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  const authError = requireCronSecret(request);
  if (authError) return authError;

  try {
    const jobId = await addGovernanceTimeoutJob();
    logger.info("governance-timeout cron: job enqueued", { jobId });
    return NextResponse.json({ success: true, data: { jobId } });
  } catch (error) {
    logger.error("governance-timeout cron: failed to enqueue job", { error });
    return NextResponse.json({ success: false, error: "Failed to enqueue governance timeout" }, { status: 500 });
  }
}
