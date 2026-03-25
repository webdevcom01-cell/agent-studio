/**
 * Scheduled Flow Execution Engine
 *
 * Handles the execution of a single FlowSchedule:
 *   1. Idempotency — creates a ScheduledExecution keyed on scheduleId + nextRunAt.
 *      Duplicate invocations (e.g. two cron pods firing at the same time) are
 *      safely skipped via the unique constraint on idempotencyKey.
 *   2. Execution — loads the agent + deployed flow, runs executeFlow(), captures
 *      duration and any output messages.
 *   3. Post-run bookkeeping — updates lastRunAt, computes the next nextRunAt,
 *      resets or increments failureCount.
 *   4. Circuit breaker — auto-disables the schedule when failureCount reaches
 *      maxRetries to prevent runaway retries.
 *   5. Analytics — fires a fire-and-forget SCHEDULE_EXECUTION event.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { executeFlow } from "@/lib/runtime/engine";
import { parseFlowContent } from "@/lib/validators/flow-content";
import { trackScheduleExecution } from "@/lib/analytics";
import { computeNextRunAt } from "@/lib/scheduler/cron-validator";
import { notifyScheduleFailure, notifyCircuitBreakerOpen } from "@/lib/scheduler/failure-notify";
import type { FlowSchedule, ScheduleType } from "@/generated/prisma";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScheduleRunResult {
  scheduleId: string;
  executionId: string;
  status: "COMPLETED" | "FAILED" | "SKIPPED";
  durationMs: number;
  error?: string;
}

// ─── Idempotency ──────────────────────────────────────────────────────────────

/**
 * Builds the idempotency key for a single schedule invocation.
 * The key encodes both the schedule ID and the scheduled fire-time so
 * that retrying the same cron tick never executes twice.
 */
function buildIdempotencyKey(scheduleId: string, scheduledAt: Date): string {
  return `${scheduleId}_${scheduledAt.getTime()}`;
}

// ─── Next-run computation ─────────────────────────────────────────────────────

/**
 * Computes the next Date when this schedule should fire, starting from `after`.
 * Returns null for MANUAL schedules (they have no automatic next run).
 */
function getNextRunAt(schedule: FlowSchedule, after: Date): Date | null {
  if (schedule.scheduleType === "MANUAL") return null;

  if (schedule.scheduleType === "INTERVAL") {
    const minutes = schedule.intervalMinutes ?? 60;
    if (minutes < 1) return null;
    return new Date(after.getTime() + minutes * 60_000);
  }

  // CRON
  return computeNextRunAt(
    {
      scheduleType: "CRON",
      cronExpression: schedule.cronExpression ?? "",
      timezone: schedule.timezone ?? "UTC",
    },
    after,
  );
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Executes the flow for a single FlowSchedule.
 *
 * Safe to call concurrently — the unique DB constraint on idempotencyKey
 * ensures only one execution runs per cron tick.
 */
export async function runScheduledFlow(
  schedule: FlowSchedule,
): Promise<ScheduleRunResult> {
  const scheduledAt = schedule.nextRunAt ?? new Date();
  const idempotencyKey = buildIdempotencyKey(schedule.id, scheduledAt);
  const startTime = Date.now();

  // ── 1. Idempotency check ─────────────────────────────────────────────────
  let execution: { id: string } | null = null;

  try {
    execution = await prisma.scheduledExecution.create({
      data: {
        flowScheduleId: schedule.id,
        status: "PENDING",
        triggeredAt: new Date(),
        idempotencyKey,
      },
      select: { id: true },
    });
  } catch (err) {
    // Unique constraint violation → already running or completed for this tick
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Unique constraint")) {
      logger.info("Schedule execution skipped (duplicate idempotency key)", {
        scheduleId: schedule.id,
        idempotencyKey,
      });
      return {
        scheduleId: schedule.id,
        executionId: idempotencyKey,
        status: "SKIPPED",
        durationMs: 0,
      };
    }
    throw err;
  }

  // ── 2. Mark as RUNNING ───────────────────────────────────────────────────
  await prisma.scheduledExecution.update({
    where: { id: execution.id },
    data: { status: "RUNNING" },
  });

  // ── 3. Load agent + flow ─────────────────────────────────────────────────
  const agent = await prisma.agent.findFirst({
    where: { id: schedule.agentId },
    include: { flow: true },
  });

  if (!agent?.flow) {
    const error = "Agent or flow not found for schedule";
    await finalise(execution.id, schedule, "FAILED", startTime, error);
    return {
      scheduleId: schedule.id,
      executionId: execution.id,
      status: "FAILED",
      durationMs: Date.now() - startTime,
      error,
    };
  }

  // Use the active (deployed) version content when available, otherwise fallback to flow.content
  let flowSource: unknown = agent.flow.content;
  if (agent.flow.activeVersionId) {
    const activeVersion = await prisma.flowVersion.findUnique({
      where: { id: agent.flow.activeVersionId },
      select: { content: true },
    });
    if (activeVersion) flowSource = activeVersion.content;
  }

  const flowContent = parseFlowContent(flowSource);
  if (!flowContent) {
    const error = "Invalid flow content — cannot parse";
    await finalise(execution.id, schedule, "FAILED", startTime, error);
    return {
      scheduleId: schedule.id,
      executionId: execution.id,
      status: "FAILED",
      durationMs: Date.now() - startTime,
      error,
    };
  }

  // ── 4. Execute the flow ──────────────────────────────────────────────────
  try {
    const conversation = await prisma.conversation.create({
      data: {
        agentId: schedule.agentId,
        status: "ACTIVE",
        variables: {
          __schedule_id: schedule.id,
          __schedule_type: schedule.scheduleType,
          __triggered_at: scheduledAt.toISOString(),
        } as object,
      },
      select: { id: true },
    });

    const context = {
      conversationId: conversation.id,
      agentId: schedule.agentId,
      flowContent,
      currentNodeId: null as string | null,
      variables: {
        __schedule_id: schedule.id,
        __schedule_type: schedule.scheduleType,
        __triggered_at: scheduledAt.toISOString(),
      } as Record<string, unknown>,
      messageHistory: [] as { role: "user" | "assistant" | "system"; content: string }[],
      isNewConversation: true,
    };

    await executeFlow(context);

    // Mark conversation as completed
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: "COMPLETED" },
    }).catch(() => {
      // Non-critical — don't fail the execution if this update fails
    });

    const durationMs = Date.now() - startTime;
    await finalise(execution.id, schedule, "COMPLETED", startTime);

    // Fire-and-forget analytics
    trackScheduleExecution({
      agentId: schedule.agentId,
      scheduleId: schedule.id,
      executionId: execution.id,
      scheduleType: schedule.scheduleType,
      durationMs,
      success: true,
    }).catch(() => {/* non-critical */});

    logger.info("Scheduled flow completed", {
      scheduleId: schedule.id,
      agentId: schedule.agentId,
      durationMs,
    });

    return {
      scheduleId: schedule.id,
      executionId: execution.id,
      status: "COMPLETED",
      durationMs,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - startTime;

    logger.error("Scheduled flow failed", err instanceof Error ? err : new Error(error), {
      scheduleId: schedule.id,
      agentId: schedule.agentId,
    });

    await finalise(execution.id, schedule, "FAILED", startTime, error);

    trackScheduleExecution({
      agentId: schedule.agentId,
      scheduleId: schedule.id,
      executionId: execution.id,
      scheduleType: schedule.scheduleType,
      durationMs,
      success: false,
      errorMessage: error,
    }).catch(() => {/* non-critical */});

    return {
      scheduleId: schedule.id,
      executionId: execution.id,
      status: "FAILED",
      durationMs,
      error,
    };
  }
}

// ─── Post-run bookkeeping ─────────────────────────────────────────────────────

/**
 * Updates both the ScheduledExecution and the parent FlowSchedule after a run.
 *
 * On success:  resets failureCount, advances nextRunAt.
 * On failure:  increments failureCount; auto-disables when maxRetries exceeded.
 */
async function finalise(
  executionId: string,
  schedule: FlowSchedule,
  status: "COMPLETED" | "FAILED",
  startTime: number,
  errorMessage?: string,
): Promise<void> {
  const completedAt = new Date();
  const durationMs = Date.now() - startTime;
  const succeeded = status === "COMPLETED";

  // Compute next fire time
  const nextRunAt = getNextRunAt(schedule, completedAt);

  // Circuit breaker
  const newFailureCount = succeeded ? 0 : (schedule.failureCount ?? 0) + 1;
  const shouldDisable =
    !succeeded && newFailureCount >= (schedule.maxRetries ?? 3);

  try {
    await prisma.$transaction([
      // Update the execution record
      prisma.scheduledExecution.update({
        where: { id: executionId },
        data: {
          status,
          completedAt,
          durationMs,
          ...(errorMessage ? { tokenUsage: { error: errorMessage } as object } : {}),
        },
      }),
      // Update the schedule record
      prisma.flowSchedule.update({
        where: { id: schedule.id },
        data: {
          lastRunAt: completedAt,
          nextRunAt,
          failureCount: newFailureCount,
          ...(shouldDisable && { enabled: false }),
        },
      }),
    ]);

    // Fire-and-forget failure notifications
    if (!succeeded) {
      const failureEvent = {
        scheduleId: schedule.id,
        agentId: schedule.agentId,
        executionId,
        error: errorMessage ?? "Unknown error",
        durationMs,
        failureCount: newFailureCount,
        maxRetries: schedule.maxRetries ?? 3,
        autoDisabled: shouldDisable,
        scheduledAt: schedule.nextRunAt?.toISOString() ?? new Date().toISOString(),
        failureWebhookUrl: schedule.failureWebhookUrl,
      };

      if (shouldDisable) {
        notifyCircuitBreakerOpen(failureEvent).catch(() => {});
      } else {
        notifyScheduleFailure(failureEvent).catch(() => {});
      }
    }
  } catch (err) {
    // Bookkeeping failure — log and continue (don't re-throw)
    logger.error("Failed to finalise scheduled execution", err instanceof Error ? err : new Error(String(err)), {
      executionId,
      scheduleId: schedule.id,
    });
  }
}

// ─── Schedule type assertion helper ──────────────────────────────────────────

/**
 * Guards that a scheduleType string is a valid Prisma ScheduleType enum value.
 * Used when querying the DB with a raw string filter.
 */
export function isValidScheduleType(s: string): s is ScheduleType {
  return s === "CRON" || s === "INTERVAL" || s === "MANUAL";
}
