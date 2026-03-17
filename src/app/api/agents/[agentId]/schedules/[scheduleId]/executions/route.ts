/**
 * GET /api/agents/[agentId]/schedules/[scheduleId]/executions
 *
 * Returns paginated execution history for a schedule.
 * Query params:
 *   limit  — number of results (default 20, max 100)
 *   cursor — createdAt ISO string for cursor-based pagination
 *   status — filter by status (PENDING|RUNNING|COMPLETED|FAILED|SKIPPED)
 *
 * Auth: requireAgentOwner
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ agentId: string; scheduleId: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { agentId, scheduleId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

    // Verify schedule belongs to this agent
    const schedule = await prisma.flowSchedule.findFirst({
      where: { id: scheduleId, agentId },
      select: { id: true },
    });
    if (!schedule) {
      return NextResponse.json(
        { success: false, error: "Schedule not found" },
        { status: 404 },
      );
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const rawLimit = parseInt(searchParams.get("limit") ?? "20", 10);
    const limit = Math.min(Math.max(1, rawLimit), 100);
    const cursor = searchParams.get("cursor");
    const statusFilter = searchParams.get("status");

    const executions = await prisma.scheduledExecution.findMany({
      where: {
        flowScheduleId: scheduleId,
        ...(statusFilter ? { status: statusFilter as never } : {}),
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { triggeredAt: "desc" },
      take: limit + 1, // fetch one extra to determine if there's a next page
      select: {
        id: true,
        status: true,
        triggeredAt: true,
        completedAt: true,
        durationMs: true,
        errorMessage: true,
        tokenUsage: true,
        costUsd: true,
        idempotencyKey: true,
        createdAt: true,
      },
    });

    const hasMore = executions.length > limit;
    const items = hasMore ? executions.slice(0, limit) : executions;
    const nextCursor = hasMore ? items[items.length - 1]?.createdAt.toISOString() : null;

    return NextResponse.json({
      success: true,
      data: {
        executions: items,
        hasMore,
        nextCursor,
      },
    });
  } catch (err) {
    logger.error("schedule_executions_list_error", err);
    return NextResponse.json(
      { success: false, error: "Failed to list executions" },
      { status: 500 },
    );
  }
}
