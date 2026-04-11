/**
 * BullMQ Worker — Flow Execution
 *
 * Processes flow.execute and eval.run jobs from the queue.
 * Runs as a separate process from the Next.js app on Railway.
 *
 * Usage:
 *   npx tsx src/lib/queue/worker.ts
 *
 * Environment:
 *   REDIS_URL — required
 *   DATABASE_URL — required (Prisma)
 */

import { Worker, type Job } from "bullmq";
import { logger } from "@/lib/logger";
import type { JobData, FlowExecuteJobData, EvalRunJobData, WebhookRetryJobData, KBIngestJobData, WebhookExecuteJobData, ManagedTaskRunJobData } from "./index";
import type { TaskInput } from "@/lib/managed-tasks/manager";

const QUEUE_NAME = "agent-studio";
const CONCURRENCY = 5;

async function processJob(job: Job<JobData>): Promise<unknown> {
  const data = job.data;

  logger.info("Processing job", {
    jobId: job.id,
    type: data.type,
    attempt: job.attemptsMade + 1,
  });

  switch (data.type) {
    case "flow.execute":
      return processFlowJob(job as Job<FlowExecuteJobData>);
    case "eval.run":
      return processEvalJob(job as Job<EvalRunJobData>);
    case "webhook.retry":
      return processWebhookRetryJob(job as Job<WebhookRetryJobData>);
    case "kb.ingest":
      return processKBIngestJob(job as Job<KBIngestJobData>);
    case "webhook.execute":
      return processWebhookExecuteJob(job as Job<WebhookExecuteJobData>);
    case "managed.task.run":
      return processManagedTaskJob(job as Job<ManagedTaskRunJobData>);
    default:
      throw new Error(`Unknown job type: ${(data as Record<string, unknown>).type}`);
  }
}

async function processFlowJob(job: Job<FlowExecuteJobData>): Promise<unknown> {
  const { agentId, conversationId, userMessage, userId } = job.data;

  const { loadContext, saveContext, saveMessages } = await import("@/lib/runtime/context");
  const { executeFlow } = await import("@/lib/runtime/engine");

  const context = await loadContext(agentId, conversationId);
  if (userId) {
    (context as unknown as Record<string, unknown>).userId = userId;
  }

  await job.updateProgress(10);

  const result = await executeFlow(context, userMessage);

  await job.updateProgress(90);

  await Promise.allSettled([
    saveMessages(conversationId, result.messages),
    saveContext(context),
  ]);

  await job.updateProgress(100);

  logger.info("Flow job completed", {
    jobId: job.id,
    agentId,
    messageCount: result.messages.length,
    waitingForInput: result.waitingForInput,
  });

  return {
    messages: result.messages,
    waitingForInput: result.waitingForInput,
    conversationId,
  };
}

async function processEvalJob(job: Job<EvalRunJobData>): Promise<unknown> {
  const { suiteId, agentId, triggeredBy, baseUrl, authHeader } = job.data;

  const { runEvalSuite } = await import("@/lib/evals/runner");

  await job.updateProgress(5);

  const result = await runEvalSuite(suiteId, agentId, {
    baseUrl,
    triggeredBy,
    authHeader,
  });

  await job.updateProgress(100);

  logger.info("Eval job completed", {
    jobId: job.id,
    suiteId,
    score: result.score,
    passed: result.passedCases,
    failed: result.failedCases,
  });

  return result;
}

async function processWebhookRetryJob(job: Job<WebhookRetryJobData>): Promise<unknown> {
  const { agentId, webhookId, executionId } = job.data;

  const { prisma } = await import("@/lib/prisma");
  const { executeWebhookTrigger } = await import("@/lib/webhooks/execute");

  // Load the stored payload and headers from the original execution.
  const execution = await prisma.webhookExecution.findUnique({
    where: { id: executionId },
    select: { rawPayload: true, rawHeaders: true, retryCount: true },
  });

  if (!execution) {
    throw new Error(`Webhook execution ${executionId} not found — cannot retry`);
  }

  if (!execution.rawPayload) {
    throw new Error(
      `Webhook execution ${executionId} has no stored payload — enable rawPayload capture to support retries`,
    );
  }

  await job.updateProgress(10);

  const result = await executeWebhookTrigger({
    agentId,
    webhookId,
    rawBody: execution.rawPayload,
    headers: (execution.rawHeaders as Record<string, string>) ?? {},
    isReplay: true,
    retryExecutionId: executionId,
  });

  await job.updateProgress(100);

  logger.info("Webhook retry job completed", {
    jobId: job.id,
    executionId,
    webhookId,
    success: result.success,
    retryCount: execution.retryCount,
  });

  return result;
}

async function processKBIngestJob(job: Job<KBIngestJobData>): Promise<unknown> {
  const { sourceId, content } = job.data;

  const { ingestSource } = await import("@/lib/knowledge/ingest");

  await job.updateProgress(10);

  await ingestSource(sourceId, content);

  await job.updateProgress(100);

  logger.info("KB ingest job completed", {
    jobId: job.id,
    sourceId,
  });

  return { sourceId, success: true };
}

/**
 * v2: Processes async webhook execution jobs.
 * Called when asyncExecution=true on the webhook config — the route returns 202
 * and this worker handles the actual flow execution.
 */
async function processWebhookExecuteJob(job: Job<WebhookExecuteJobData>): Promise<unknown> {
  const { agentId, webhookId, executionId, rawBody, headers, sourceIp } = job.data;

  const { executeWebhookTrigger } = await import("@/lib/webhooks/execute");

  await job.updateProgress(10);

  const result = await executeWebhookTrigger({
    agentId,
    webhookId,
    rawBody,
    headers,
    sourceIp,
    isAsyncWorker: true,
    retryExecutionId: executionId,
  });

  await job.updateProgress(100);

  logger.info("Async webhook execute job completed", {
    jobId: job.id,
    executionId,
    webhookId,
    agentId,
    success: result.success,
  });

  return result;
}

/**
 * P4: Processes long-running managed agent task jobs.
 * Uses the Vercel AI SDK generateText with streaming step hooks to support
 * pause/cancel checks between tool-use steps.
 */
async function processManagedTaskJob(job: Job<ManagedTaskRunJobData>): Promise<unknown> {
  const { taskId, agentId, userId } = job.data;

  const {
    getTask,
    markRunning,
    markCompleted,
    markFailed,
    isCancelled,
    isPaused,
    updateProgress: updateTaskProgress,
  } = await import("@/lib/managed-tasks/manager");
  const { getModel } = await import("@/lib/ai");
  const { generateText, stepCountIs } = await import("ai");
  const { fireSdkLearnHook } = await import("@/lib/ecc/sdk-learn-hook");

  // Load the task record
  const task = await getTask(taskId);
  if (!task) {
    throw new Error(`Managed task ${taskId} not found`);
  }

  const input = task.input as TaskInput;

  // Mark task as running
  await markRunning(taskId, job.id ?? `managed-task-${taskId}`);
  await job.updateProgress(5);

  const modelId = input.model ?? "claude-sonnet-4-6";
  const model = getModel(modelId);
  const startedAt = Date.now();

  let currentStep = 0;
  const maxSteps = input.maxSteps ?? 50;

  try {
    // Check cancellation before starting
    if (await isCancelled(taskId)) {
      logger.info("Managed task cancelled before start", { taskId });
      return { taskId, cancelled: true };
    }

    const result = await generateText({
      model,
      prompt: input.task,
      stopWhen: stepCountIs(maxSteps),
      onStepFinish: async ({ finishReason, usage }) => {
        currentStep++;
        // Progress: 5% start → 90% max across all steps
        const stepProgress = Math.min(5 + Math.floor((currentStep / maxSteps) * 85), 90);
        await Promise.allSettled([
          job.updateProgress(stepProgress),
          updateTaskProgress(taskId, stepProgress),
        ]);

        logger.info("Managed task step finished", {
          taskId,
          finishReason,
          step: currentStep,
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
        });

        // Honour pause between steps
        let pauseChecks = 0;
        while (await isPaused(taskId)) {
          pauseChecks++;
          if (pauseChecks > 300) {
            // 5 minutes max pause wait (1s interval × 300)
            throw new Error("Task pause timeout exceeded");
          }
          await new Promise<void>((resolve) => setTimeout(resolve, 1000));
        }

        // Honour cancel between steps
        if (await isCancelled(taskId)) {
          throw new Error("TASK_CANCELLED");
        }
      },
    });

    const durationMs = Date.now() - startedAt;
    const inputTokens = result.usage.inputTokens ?? 0;
    const outputTokens = result.usage.outputTokens ?? 0;
    const responseText = result.text;

    const output = {
      result: responseText,
      inputTokens,
      outputTokens,
      durationMs,
      sessionId: input.sdkSessionId,
    };

    await markCompleted(taskId, output);
    await job.updateProgress(100);

    // Fire learn hook (fire-and-forget)
    void fireSdkLearnHook({
      agentId,
      userId: userId ?? undefined,
      task: input.task,
      response: responseText,
      modelId,
      durationMs,
      inputTokens,
      outputTokens,
    });

    // Fire callback webhook if configured
    if (task.callbackUrl) {
      void fireTaskCallback(task.callbackUrl, {
        taskId,
        agentId,
        status: "COMPLETED",
        output,
      });
    }

    logger.info("Managed task job completed", {
      jobId: job.id,
      taskId,
      agentId,
      durationMs,
      inputTokens,
      outputTokens,
      steps: currentStep,
    });

    return output;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    if (errorMsg === "TASK_CANCELLED") {
      logger.info("Managed task was cancelled mid-execution", { taskId });
      // Task record already set to CANCELLED by the user action
      return { taskId, cancelled: true };
    }

    const durationMs = Date.now() - startedAt;
    await markFailed(taskId, errorMsg);

    if (task.callbackUrl) {
      void fireTaskCallback(task.callbackUrl, {
        taskId,
        agentId,
        status: "FAILED",
        error: errorMsg,
      });
    }

    logger.error("Managed task job failed", { jobId: job.id, taskId, agentId, error: err });
    throw err; // Re-throw so BullMQ records the failure
  }
}

/**
 * Fire-and-forget HTTP POST to the task's callbackUrl.
 * Errors are logged but never propagated.
 */
async function fireTaskCallback(
  url: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      logger.warn("Managed task callback returned non-2xx", {
        url,
        status: res.status,
        taskId: payload.taskId,
      });
    }
  } catch (err) {
    logger.warn("Managed task callback failed", { url, taskId: payload.taskId, error: err });
  }
}

export function createWorker(): Worker<JobData> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error("REDIS_URL required for worker");
  }

  const worker = new Worker<JobData>(QUEUE_NAME, processJob, {
    connection: { url: redisUrl },
    concurrency: CONCURRENCY,
    limiter: {
      max: 50,
      duration: 60_000,
    },
  });

  worker.on("completed", (job) => {
    logger.info("Job completed", { jobId: job.id, type: job.data.type });
  });

  worker.on("failed", (job, err) => {
    logger.error("Job failed", err, {
      jobId: job?.id,
      type: job?.data.type,
      attemptsMade: job?.attemptsMade,
    });
  });

  worker.on("error", (err) => {
    logger.error("Worker error", err);
  });

  logger.info("BullMQ worker started", {
    queue: QUEUE_NAME,
    concurrency: CONCURRENCY,
  });

  return worker;
}

/**
 * Start a minimal HTTP server for Railway health checks.
 */
function startHealthServer(port: number): void {
  import("node:http").then(({ createServer }) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "healthy", service: "worker" }));
    });
    server.listen(port, () => {
      logger.info("Worker health server started", { port });
    });
  });
}

// Direct execution: npx tsx src/lib/queue/worker.ts
const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1]?.includes("worker");

if (isDirectRun) {
  const worker = createWorker();
  const port = Number(process.env.PORT) || 8080;
  startHealthServer(port);

  // Graceful shutdown: drain active jobs before exiting
  async function shutdown(signal: string): Promise<void> {
    logger.info("Graceful shutdown initiated", { signal });
    try {
      await worker.close();
      logger.info("Worker drained and closed");
    } catch (err) {
      logger.error("Error during worker shutdown", { error: err });
    }
    process.exit(0);
  }

  process.on("SIGTERM", () => { void shutdown("SIGTERM"); });
  process.on("SIGINT",  () => { void shutdown("SIGINT"); });
}
