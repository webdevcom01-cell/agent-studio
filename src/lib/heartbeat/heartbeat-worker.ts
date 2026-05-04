import type { Job } from "bullmq";
import { logger } from "@/lib/logger";
import type { Prisma } from "@/generated/prisma";
import { registerSession, removeSession } from "@/lib/session/session-tracker";

export interface HeartbeatJobData {
  type: "heartbeat.run";
  agentId: string;
  configId: string;
  organizationId: string;
}

export async function processHeartbeatRunJob(job: Job<HeartbeatJobData>): Promise<unknown> {
  const { agentId, configId, organizationId } = job.data;

  const { prisma } = await import("@/lib/prisma");
  const { loadContext, saveContext, saveMessages } = await import("@/lib/runtime/context");
  const { executeFlow } = await import("@/lib/runtime/engine");
  const { pruneContext, getContext, buildContextPrompt } = await import("@/lib/heartbeat/context-manager");

  const run = await prisma.heartbeatRun.create({
    data: { agentId, configId, organizationId, status: "RUNNING", startedAt: new Date() },
    select: { id: true },
  });

  await job.updateProgress(10);

  const config = await prisma.heartbeatConfig.findUnique({
    where: { id: configId },
    select: { systemPrompt: true },
  });

  if (!config) {
    await prisma.heartbeatRun.update({
      where: { id: run.id },
      data: { status: "FAILED", completedAt: new Date(), error: "HeartbeatConfig not found" },
    });
    throw new Error(`HeartbeatConfig ${configId} not found`);
  }

  const startTime = Date.now();

  try {
    await registerSession(agentId, run.id, "heartbeat-worker", "internal");

    await pruneContext(agentId);

    const contextSnapshot = await getContext(agentId);
    const contextPrompt = await buildContextPrompt(agentId);

    await job.updateProgress(20);

    const context = await loadContext(agentId);
    context.variables = {
      ...context.variables,
      __heartbeat_config_id: configId,
      __heartbeat_started_at: new Date().toISOString(),
    };

    const parts: string[] = [];
    if (contextPrompt) parts.push(contextPrompt);
    if (config.systemPrompt) parts.push(config.systemPrompt);
    const userMessage = parts.join("\n\n") || "Run scheduled heartbeat task.";

    await job.updateProgress(30);

    const result = await executeFlow(context, userMessage);

    await job.updateProgress(90);

    const durationMs = Date.now() - startTime;
    const outputMessages = result.messages.map((m) => ({ role: m.role, content: m.content }));

    await Promise.allSettled([
      saveMessages(context.conversationId, result.messages),
      saveContext(context),
    ]);

    await prisma.heartbeatRun.update({
      where: { id: run.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        durationMs,
        contextSnapshot: contextSnapshot as Prisma.InputJsonValue,
        output: { messages: outputMessages } as Prisma.InputJsonValue,
      },
    });

    await job.updateProgress(100);

    logger.info("Heartbeat run completed", { jobId: job.id, agentId, configId, durationMs });

    return { runId: run.id, agentId, configId, durationMs };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - startTime;

    await prisma.heartbeatRun.update({
      where: { id: run.id },
      data: { status: "FAILED", completedAt: new Date(), durationMs, error },
    }).catch(() => {/* non-critical */});

    logger.error("Heartbeat run failed", { jobId: job.id, agentId, configId, error: err });
    throw err;
  } finally {
    removeSession(agentId, run.id).catch(() => {});
  }
}
