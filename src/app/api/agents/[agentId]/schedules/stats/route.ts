/**
 * GET /api/agents/[agentId]/schedules/stats
 *
 * Returns aggregate statistics for all schedules belonging to an agent:
 *   - total:          total schedule count
 *   - enabled:        how many are enabled
 *   - disabled:       how many are disabled
 *   - circuitBroken:  schedules auto-disabled by the circuit breaker (failureCount >= maxRetries)
 *   - successRate:    fraction of COMPLETED executions over all terminal executions (0–1, null if none)
 *   - avgDurationMs:  average duration of COMPLETED executions (null if none)
 *   - nextDueAt:      earliest nextRunAt across all enabled schedules (null if none)
 *   - totalExecutions: total execution count across all schedules
 *
 * Auth: requireAgentOwner
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

export async function GET(
  _request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { agentId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

    // Run all queries in parallel for speed
    const [schedules, execStats, nextDueRow] = await Promise.all([
      // All schedule records (lightweight — only status fields)
      prisma.flowSchedule.findMany({
        where: { agentId },
        select: {
          id: true,
          enabled: true,
          failureCount: true,
          maxRetries: true,
        },
      }),

      // Aggregate execution stats across all schedules for this agent
      prisma.scheduledExecution.aggregate({
        where: {
          flowSchedule: { agentId },
        },
        _count: { id: true },
        _avg: {
          durationMs: true,
        },
      }),

      // Earliest nextRunAt among enabled schedules
      prisma.flowSchedule.findFirst({
        where: { agentId, enabled: true, scheduleType: { not: "MANUAL" } },
        orderBy: { nextRunAt: "asc" },
        select: { nextRunAt: true },
      }),
    ]);

    // Compute per-schedule counts
    const total = schedules.length;
    const enabled = schedules.filter((s) => s.enabled).length;
    const disabled = total - enabled;
    const circuitBroken = schedules.filter(
      (s) => !s.enabled && (s.failureCount ?? 0) >= (s.maxRetries ?? 3),
    ).length;

    // Success rate: count COMPLETED vs all terminal statuses
    const [completedCount, terminalCount] = await Promise.all([
      prisma.scheduledExecution.count({
        where: { flowSchedule: { agentId }, status: "COMPLETED" },
      }),
      prisma.scheduledExecution.count({
        where: {
          flowSchedule: { agentId },
          status: { in: ["COMPLETED", "FAILED"] },
        },
      }),
    ]);

    const successRate =
      terminalCount > 0 ? completedCount / terminalCount : null;

    return NextResponse.json({
      success: true,
      data: {
        total,
        enabled,
        disabled,
        circuitBroken,
        successRate,
        avgDurationMs: execStats._avg.durationMs
          ? Math.round(execStats._avg.durationMs)
          : null,
        nextDueAt: nextDueRow?.nextRunAt ?? null,
        totalExecutions: execStats._count.id,
      },
    });
  } catch (err) {
    logger.error("schedule_stats_error", err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch schedule stats" },
      { status: 500 },
    );
  }
}
