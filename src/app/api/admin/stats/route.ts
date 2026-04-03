import { NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/api/auth-guard";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export async function GET(): Promise<NextResponse> {
  const authResult = await requireAdmin();
  if (isAuthError(authResult)) return authResult;

  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      totalAgents,
      totalConversations,
      totalUsers,
      recentWebhookExecutions,
      failedWebhookExecutions,
      recentConversations,
      activeUsers,
      topUsers,
    ] = await Promise.all([
      prisma.agent.count(),
      prisma.conversation.count(),
      prisma.user.count(),
      prisma.webhookExecution.count({
        where: { triggeredAt: { gte: thirtyDaysAgo } },
      }),
      prisma.webhookExecution.count({
        where: { triggeredAt: { gte: thirtyDaysAgo }, status: "FAILED" },
      }),
      prisma.conversation.count({
        where: { createdAt: { gte: thirtyDaysAgo } },
      }),
      prisma.user.count({
        where: { updatedAt: { gte: oneDayAgo } },
      }),
      // Top users by number of agents (visibility only — no PII filtering needed
      // since this is an admin-only view with no access enforcement)
      prisma.user.findMany({
        take: 10,
        where: {
          agents: { some: {} },
        },
        orderBy: {
          agents: { _count: "desc" },
        },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
          _count: {
            select: {
              agents: true,
            },
          },
        },
      }),
    ]);

    const webhookErrorRate =
      recentWebhookExecutions > 0
        ? (failedWebhookExecutions / recentWebhookExecutions) * 100
        : 0;

    // Queue depth — graceful fallback if Redis/queue not available
    let queueDepth = 0;
    let queueDelayed = 0;
    try {
      const { getQueue } = await import("@/lib/queue");
      const queue = getQueue();
      [queueDepth, queueDelayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getDelayedCount(),
      ]);
    } catch {
      // Queue not configured — degrade gracefully
    }

    return NextResponse.json({
      success: true,
      data: {
        overview: {
          totalUsers,
          activeUsers,
          totalAgents,
          totalConversations,
          recentConversations,
        },
        webhooks: {
          executions30d: recentWebhookExecutions,
          failed30d: failedWebhookExecutions,
          errorRate: Number(webhookErrorRate.toFixed(1)),
        },
        queue: {
          waiting: queueDepth,
          delayed: queueDelayed,
        },
        topUsers: topUsers.map((u) => ({
          id: u.id,
          name: u.name ?? "Anonymous",
          email: u.email ?? "—",
          agentCount: u._count.agents,
          joinedAt: u.createdAt.toISOString(),
        })),
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
