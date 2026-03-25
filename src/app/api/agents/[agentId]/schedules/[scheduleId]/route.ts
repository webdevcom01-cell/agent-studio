/**
 * GET    /api/agents/[agentId]/schedules/[scheduleId] — Get single schedule
 * PATCH  /api/agents/[agentId]/schedules/[scheduleId] — Update schedule
 * DELETE /api/agents/[agentId]/schedules/[scheduleId] — Delete schedule
 *
 * Auth: requireAgentOwner
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { UpdateScheduleSchema } from "@/lib/scheduler/schemas";
import { computeNextRunAt } from "@/lib/scheduler/cron-validator";

interface RouteParams {
  params: Promise<{ agentId: string; scheduleId: string }>;
}

// ─── GET — single schedule ────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { agentId, scheduleId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

    const schedule = await prisma.flowSchedule.findFirst({
      where: { id: scheduleId, agentId },
      include: {
        _count: { select: { executions: true } },
        executions: {
          orderBy: { triggeredAt: "desc" },
          take: 5,
        },
      },
    });

    if (!schedule) {
      return NextResponse.json(
        { success: false, error: "Schedule not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: schedule });
  } catch (err) {
    logger.error("schedule_get_error", err);
    return NextResponse.json(
      { success: false, error: "Failed to get schedule" },
      { status: 500 },
    );
  }
}

// ─── PATCH — update schedule ──────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { agentId, scheduleId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

    // Rate limit: 30 schedule updates per user per minute
    const rateResult = checkRateLimit(`schedule_update:${authResult.userId}`, 30);
    if (!rateResult.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests — try again in a moment" },
        { status: 429 },
      );
    }

    // Verify ownership
    const existing = await prisma.flowSchedule.findFirst({
      where: { id: scheduleId, agentId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Schedule not found" },
        { status: 404 },
      );
    }

    // Parse + validate body
    const body = await request.json().catch(() => ({}));
    const parsed = UpdateScheduleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.errors[0]?.message ?? "Invalid request body",
        },
        { status: 400 },
      );
    }

    const updates = parsed.data;

    // Recompute nextRunAt if schedule fields changed
    const effectiveType = updates.scheduleType ?? existing.scheduleType;
    const effectiveCron = updates.cronExpression !== undefined
      ? updates.cronExpression
      : existing.cronExpression;
    const effectiveInterval = updates.intervalMinutes !== undefined
      ? updates.intervalMinutes
      : existing.intervalMinutes;
    const effectiveTz = updates.timezone ?? existing.timezone;

    const scheduleFieldChanged =
      updates.scheduleType !== undefined ||
      updates.cronExpression !== undefined ||
      updates.intervalMinutes !== undefined ||
      updates.timezone !== undefined;

    const nextRunAt = scheduleFieldChanged
      ? computeNextRunAt({
          scheduleType: effectiveType,
          cronExpression: effectiveCron,
          intervalMinutes: effectiveInterval,
          timezone: effectiveTz,
        })
      : undefined; // keep existing nextRunAt

    // Reset failureCount when re-enabling
    const failureCountReset =
      updates.enabled === true && !existing.enabled
        ? { failureCount: 0 }
        : {};

    const schedule = await prisma.flowSchedule.update({
      where: { id: scheduleId },
      data: {
        ...updates,
        ...(nextRunAt !== undefined ? { nextRunAt } : {}),
        ...failureCountReset,
      },
    });

    logger.info("schedule_updated", { agentId, scheduleId, changes: Object.keys(updates) });

    return NextResponse.json({ success: true, data: schedule });
  } catch (err) {
    logger.error("schedule_update_error", err);
    return NextResponse.json(
      { success: false, error: "Failed to update schedule" },
      { status: 500 },
    );
  }
}

// ─── DELETE — delete schedule ─────────────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { agentId, scheduleId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

    const existing = await prisma.flowSchedule.findFirst({
      where: { id: scheduleId, agentId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Schedule not found" },
        { status: 404 },
      );
    }

    await prisma.flowSchedule.delete({ where: { id: scheduleId } });

    logger.info("schedule_deleted", { agentId, scheduleId });

    return NextResponse.json({ success: true, data: { id: scheduleId } });
  } catch (err) {
    logger.error("schedule_delete_error", err);
    return NextResponse.json(
      { success: false, error: "Failed to delete schedule" },
      { status: 500 },
    );
  }
}
