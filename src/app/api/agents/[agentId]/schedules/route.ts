/**
 * GET  /api/agents/[agentId]/schedules — List all schedules for an agent
 * POST /api/agents/[agentId]/schedules — Create a new schedule
 *
 * Auth: requireAgentOwner (agent must belong to the authenticated user)
 * Max schedules per agent: 10 (prevents abuse)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import { CreateScheduleSchema } from "@/lib/scheduler/schemas";
import { computeNextRunAt } from "@/lib/scheduler/cron-validator";

const MAX_SCHEDULES_PER_AGENT = 10;

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

// ─── GET — list schedules ─────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { agentId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

    const schedules = await prisma.flowSchedule.findMany({
      where: { agentId },
      orderBy: { createdAt: "asc" },
      include: {
        _count: { select: { executions: true } },
        executions: {
          orderBy: { triggeredAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            triggeredAt: true,
            completedAt: true,
            durationMs: true,
            errorMessage: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: schedules });
  } catch (err) {
    logger.error("schedules_list_error", err);
    return NextResponse.json(
      { success: false, error: "Failed to list schedules" },
      { status: 500 },
    );
  }
}

// ─── POST — create schedule ───────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { agentId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

    // Enforce schedule limit
    const count = await prisma.flowSchedule.count({ where: { agentId } });
    if (count >= MAX_SCHEDULES_PER_AGENT) {
      return NextResponse.json(
        {
          success: false,
          error: `Maximum of ${MAX_SCHEDULES_PER_AGENT} schedules per agent reached`,
        },
        { status: 422 },
      );
    }

    // Parse + validate body
    const body = await request.json().catch(() => ({}));
    const parsed = CreateScheduleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.errors[0]?.message ?? "Invalid request body",
        },
        { status: 400 },
      );
    }

    const data = parsed.data;

    // Compute initial nextRunAt
    const nextRunAt = computeNextRunAt({
      scheduleType: data.scheduleType,
      cronExpression: data.cronExpression,
      intervalMinutes: data.intervalMinutes,
      timezone: data.timezone,
    });

    const schedule = await prisma.flowSchedule.create({
      data: {
        agentId,
        scheduleType: data.scheduleType,
        cronExpression: data.cronExpression ?? null,
        intervalMinutes: data.intervalMinutes ?? null,
        timezone: data.timezone,
        enabled: data.enabled,
        label: data.label ?? null,
        maxRetries: data.maxRetries,
        nextRunAt,
      },
    });

    logger.info("schedule_created", {
      agentId,
      scheduleId: schedule.id,
      scheduleType: schedule.scheduleType,
    });

    return NextResponse.json({ success: true, data: schedule }, { status: 201 });
  } catch (err) {
    logger.error("schedule_create_error", err);
    return NextResponse.json(
      { success: false, error: "Failed to create schedule" },
      { status: 500 },
    );
  }
}
