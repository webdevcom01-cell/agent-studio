import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { computeNextRunAt } from "@/lib/scheduler/cron-validator";
import type { ScheduleType } from "@/generated/prisma";

export async function scheduleHeartbeat(configId: string): Promise<void> {
  const config = await prisma.heartbeatConfig.findUnique({
    where: { id: configId },
    select: { id: true, agentId: true, cronExpression: true, timezone: true, enabled: true, flowScheduleId: true },
  });

  if (!config) throw new Error(`HeartbeatConfig ${configId} not found`);

  const nextRunAt = computeNextRunAt(
    { scheduleType: "CRON" as ScheduleType, cronExpression: config.cronExpression, timezone: config.timezone },
    new Date(),
  );

  if (config.flowScheduleId) {
    await prisma.flowSchedule.update({
      where: { id: config.flowScheduleId },
      data: { cronExpression: config.cronExpression, timezone: config.timezone, enabled: config.enabled, nextRunAt },
    });
    logger.info("Heartbeat FlowSchedule updated", { configId, flowScheduleId: config.flowScheduleId });
  } else {
    const schedule = await prisma.flowSchedule.create({
      data: {
        agentId: config.agentId,
        scheduleType: "CRON" as ScheduleType,
        cronExpression: config.cronExpression,
        timezone: config.timezone,
        enabled: config.enabled,
        nextRunAt,
        label: "Heartbeat",
      },
    });

    await prisma.heartbeatConfig.update({
      where: { id: configId },
      data: { flowScheduleId: schedule.id },
    });

    logger.info("Heartbeat FlowSchedule created", { configId, flowScheduleId: schedule.id });
  }
}

export async function unscheduleHeartbeat(configId: string): Promise<void> {
  const config = await prisma.heartbeatConfig.findUnique({
    where: { id: configId },
    select: { flowScheduleId: true },
  });

  if (!config) return;

  if (config.flowScheduleId) {
    await prisma.flowSchedule.update({
      where: { id: config.flowScheduleId },
      data: { enabled: false },
    });
  }

  await prisma.heartbeatConfig.update({
    where: { id: configId },
    data: { enabled: false },
  });

  logger.info("Heartbeat unscheduled", { configId });
}
