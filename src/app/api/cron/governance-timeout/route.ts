import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getEnv } from "@/lib/env";
import { addGovernanceTimeoutJob } from "@/lib/queue";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

function isCronAuthorized(request: NextRequest): boolean {
  const env = getEnv();
  const secret = env.CRON_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      logger.warn("CRON_SECRET not set in production — governance-timeout endpoint is unprotected");
    }
    return true;
  }

  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${secret}`;
}

export async function GET(request: NextRequest): Promise<Response> {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const jobId = await addGovernanceTimeoutJob();
    logger.info("governance-timeout cron: job enqueued", { jobId });
    return NextResponse.json({ success: true, data: { jobId } });
  } catch (error) {
    logger.error("governance-timeout cron: failed to enqueue job", { error });
    return NextResponse.json({ success: false, error: "Failed to enqueue governance timeout" }, { status: 500 });
  }
}
