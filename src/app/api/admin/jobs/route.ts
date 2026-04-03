import { NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/api/auth-guard";
import { getQueue } from "@/lib/queue";
import { logger } from "@/lib/logger";

export async function GET(): Promise<NextResponse> {
  const authResult = await requireAdmin();
  if (isAuthError(authResult)) return authResult;

  try {
    const queue = getQueue();

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    const recentJobs = await queue.getJobs(
      ["active", "waiting", "failed", "completed"],
      0,
      20,
    );

    const jobInfos = recentJobs.map((job) => ({
      id: job.id ?? "unknown",
      name: job.name,
      state: job.finishedOn
        ? job.failedReason
          ? "failed"
          : "completed"
        : job.processedOn
          ? "active"
          : "waiting",
      progress: typeof job.progress === "number" ? job.progress : 0,
      attemptsMade: job.attemptsMade,
      createdAt: job.timestamp ? new Date(job.timestamp).toISOString() : "",
      failedReason: job.failedReason,
    }));

    return NextResponse.json({
      success: true,
      data: {
        stats: { waiting, active, completed, failed, delayed },
        recentJobs: jobInfos,
      },
    });
  } catch (err) {
    logger.error("Failed to fetch job stats", err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch job queue status" },
      { status: 500 },
    );
  }
}
