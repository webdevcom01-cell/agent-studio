import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export async function GET(): Promise<NextResponse> {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      totalAgents,
      totalConversations,
      recentExecutions,
      failedExecutions,
      activeUsers,
    ] = await Promise.all([
      prisma.agent.count(),
      prisma.conversation.count(),
      prisma.webhookExecution.count({
        where: { triggeredAt: { gte: thirtyDaysAgo } },
      }),
      prisma.webhookExecution.count({
        where: { triggeredAt: { gte: thirtyDaysAgo }, status: "FAILED" },
      }),
      prisma.user.count({
        where: { updatedAt: { gte: oneDayAgo } },
      }),
    ]);

    const errorRate = recentExecutions > 0
      ? (failedExecutions / recentExecutions) * 100
      : 0;

    // Queue depth — graceful fallback if queue not available
    let queueDepth = 0;
    try {
      const { getQueue } = await import("@/lib/queue");
      const queue = getQueue();
      queueDepth = await queue.getWaitingCount();
    } catch {
      // Queue not configured
    }

    return NextResponse.json({
      success: true,
      data: {
        activeUsers,
        totalAgents,
        pipelineExecutions: recentExecutions,
        errorRate: Number(errorRate.toFixed(1)),
        queueDepth,
        totalConversations,
      },
    });
  } catch (err) {
    logger.error("Failed to fetch admin stats", err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch stats" },
      { status: 500 },
    );
  }
}
