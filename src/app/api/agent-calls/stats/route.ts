import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const PERIOD_MAP: Record<string, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") ?? "24h";
    const periodMs = PERIOD_MAP[period] ?? PERIOD_MAP["24h"];
    const since = new Date(Date.now() - periodMs);

    const logs = await prisma.agentCallLog.findMany({
      where: {
        callerAgent: { userId: session.user.id },
        createdAt: { gte: since },
      },
      include: {
        callerAgent: { select: { id: true, name: true } },
        calleeAgent: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const totalCalls = logs.length;
    const completed = logs.filter((l) => l.status === "COMPLETED").length;
    const successRate = totalCalls > 0 ? completed / totalCalls : 0;

    const durations = logs
      .filter((l) => l.durationMs !== null)
      .map((l) => l.durationMs!);
    const avgDurationMs =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0;

    const totalTokensUsed = logs.reduce(
      (sum, l) => sum + (l.tokensUsed ?? 0),
      0
    );

    const estimatedTotalCost = logs.reduce(
      (sum, l) => sum + Number(l.estimatedCostUsd ?? 0),
      0
    );

    const callerCounts = new Map<string, { name: string; count: number }>();
    const calleeCounts = new Map<string, { name: string; count: number }>();

    for (const log of logs) {
      const callerId = log.callerAgentId;
      const callerName = log.callerAgent.name;
      const existing = callerCounts.get(callerId) ?? {
        name: callerName,
        count: 0,
      };
      existing.count += 1;
      callerCounts.set(callerId, existing);

      if (log.calleeAgent) {
        const calleeId = log.calleeAgent.id;
        const calleeName = log.calleeAgent.name;
        const ex = calleeCounts.get(calleeId) ?? {
          name: calleeName,
          count: 0,
        };
        ex.count += 1;
        calleeCounts.set(calleeId, ex);
      }
    }

    const topCallerAgents = [...callerCounts.entries()]
      .map(([agentId, { name, count }]) => ({ agentId, name, callCount: count }))
      .sort((a, b) => b.callCount - a.callCount)
      .slice(0, 5);

    const topCalleeAgents = [...calleeCounts.entries()]
      .map(([agentId, { name, count }]) => ({ agentId, name, callCount: count }))
      .sort((a, b) => b.callCount - a.callCount)
      .slice(0, 5);

    const recentFailures = logs
      .filter((l) => l.status === "FAILED")
      .slice(0, 5)
      .map((l) => ({
        taskId: l.taskId,
        callerName: l.callerAgent.name,
        calleeName: l.calleeAgent?.name ?? l.externalUrl ?? "unknown",
        error: l.errorMessage ?? "Unknown error",
        createdAt: l.createdAt,
      }));

    return NextResponse.json({
      success: true,
      data: {
        period,
        totalCalls,
        successRate: Math.round(successRate * 100) / 100,
        avgDurationMs,
        totalTokensUsed,
        estimatedTotalCost: Math.round(estimatedTotalCost * 1000000) / 1000000,
        topCallerAgents,
        topCalleeAgents,
        recentFailures,
      },
    });
  } catch (err) {
    logger.error("Failed to get agent call stats", err, {});
    return NextResponse.json(
      { success: false, error: "Failed to get stats" },
      { status: 500 }
    );
  }
}
