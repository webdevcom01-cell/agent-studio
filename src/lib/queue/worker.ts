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
import type { JobData, FlowExecuteJobData, EvalRunJobData, WebhookRetryJobData, KBIngestJobData, WebhookExecuteJobData, ManagedTaskRunJobData, McpFlowRunJobData, PipelineRunJobData } from "./index";
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
    case "mcp.flow.run":
      return processMcpFlowJob(job as Job<McpFlowRunJobData>);
    case "pipeline.run":
      return processPipelineRunJob(job as Job<PipelineRunJobData>);
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

  // Validate required fields
  if (!input.task || typeof input.task !== "string" || input.task.trim().length === 0) {
    throw new Error(`Managed task ${taskId}: missing or empty task description in input`);
  }

  // Mark task as running
  await markRunning(taskId, job.id ?? `managed-task-${taskId}`);
  await job.updateProgress(5);

  const MAX_STEPS_UPPER_BOUND = 100;
  const GENERATE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

  const modelId = input.model ?? "claude-sonnet-4-6";
  const model = getModel(modelId);
  const startedAt = Date.now();

  let currentStep = 0;
  const rawMaxSteps = input.maxSteps ?? 50;
  const maxSteps = Math.min(Math.max(1, rawMaxSteps), MAX_STEPS_UPPER_BOUND);

  try {
    // Check cancellation before starting
    if (await isCancelled(taskId)) {
      logger.info("Managed task cancelled before start", { taskId });
      return { taskId, cancelled: true };
    }

    // Timeout controller — prevent hung AI provider from blocking worker slot
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), GENERATE_TIMEOUT_MS);

    let result: Awaited<ReturnType<typeof generateText>>;
    try {
      result = await generateText({
        model,
        prompt: input.task,
        stopWhen: stepCountIs(maxSteps),
        abortSignal: timeoutController.signal,
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

          // Honour pause between steps — max 2 minutes, check every 2s
          // Shorter than before (was 5min/1s) to avoid blocking worker slots
          const MAX_PAUSE_CHECKS = 60; // 60 × 2s = 2 minutes
          let pauseChecks = 0;
          while (await isPaused(taskId)) {
            pauseChecks++;
            if (pauseChecks > MAX_PAUSE_CHECKS) {
              throw new Error("Task pause timeout exceeded (2 min)");
            }
            await new Promise<void>((resolve) => setTimeout(resolve, 2000));
          }

          // Honour cancel between steps
          if (await isCancelled(taskId)) {
            const cancelError = new Error("Task was cancelled");
            (cancelError as Error & { code: string }).code = "TASK_CANCELLED";
            throw cancelError;
          }
        },
      });
    } finally {
      clearTimeout(timeoutId);
    }

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

    const isCancel =
      (err instanceof Error && (err as Error & { code?: string }).code === "TASK_CANCELLED") ||
      errorMsg === "TASK_CANCELLED"; // backwards compat
    if (isCancel) {
      logger.info("Managed task was cancelled mid-execution", { taskId });
      // Task record already set to CANCELLED by the user action
      return { taskId, cancelled: true };
    }

    const isTimeout = err instanceof Error && err.name === "AbortError";
    if (isTimeout) {
      const durationMs = Date.now() - startedAt;
      await markFailed(taskId, `Task timed out after ${Math.round(durationMs / 1000)}s`);
      logger.error("Managed task timed out", { taskId, agentId, durationMs });
      throw err;
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
 * MCP: Processes async flow execution jobs triggered by the MCP trigger_agent tool.
 * Creates a conversation, runs executeFlow, and stores the output in ManagedAgentTask.
 */
async function processMcpFlowJob(job: Job<McpFlowRunJobData>): Promise<unknown> {
  const { taskId, agentId, userId, message, variables } = job.data;

  const { prisma } = await import("@/lib/prisma");
  const { executeFlow } = await import("@/lib/runtime/engine");
  const { parseFlowContent } = await import("@/lib/validators/flow-content");
  const { markRunning, markCompleted, markFailed, markAbandoned } = await import("@/lib/managed-tasks/manager");
  const { logger: log } = await import("@/lib/logger");
  type TaskOutput = import("@/lib/managed-tasks/manager").TaskOutput;

  await markRunning(taskId, job.id ?? `mcp-flow-${taskId}`);
  await job.updateProgress(10);

  const startTime = Date.now();
  let conversationId: string | null = null;

  try {
    const agent = await prisma.agent.findFirst({
      where: { id: agentId, userId },
      include: { flow: true },
    });

    if (!agent) throw new Error(`Agent "${agentId}" not found`);
    if (!agent.flow) throw new Error(`Agent "${agentId}" has no flow configured`);

    const flowContent = parseFlowContent(agent.flow.content);
    await job.updateProgress(20);

    const conversation = await prisma.conversation.create({
      data: {
        agentId,
        status: "ACTIVE",
        variables: variables as import("@/generated/prisma").Prisma.InputJsonValue,
      },
    });
    conversationId = conversation.id;

    const context = {
      conversationId,
      agentId,
      flowContent,
      currentNodeId: null as string | null,
      variables: { ...variables },
      messageHistory: [] as Array<{ role: "user" | "assistant" | "system"; content: string }>,
      isNewConversation: true,
    };

    await job.updateProgress(30);
    const result = await executeFlow(context, message);
    await job.updateProgress(90);

    const lastAssistant = result.messages.filter((m) => m.role === "assistant").pop();
    const durationMs = Date.now() - startTime;

    if (!lastAssistant) {
      await markAbandoned(taskId, "Flow completed but produced no assistant output.");
      await prisma.conversation.update({ where: { id: conversationId }, data: { status: "ABANDONED" } });
      await job.updateProgress(100);
      log.warn("MCP flow job abandoned — no assistant output", { jobId: job.id, taskId, agentId, durationMs });
      return { conversationId, output: null, messageCount: result.messages.length, durationMs };
    }

    const output: TaskOutput = {
      result: lastAssistant.content,
      inputTokens: 0,
      outputTokens: 0,
      durationMs,
      sessionId: conversationId,
    };

    await markCompleted(taskId, output);
    await prisma.conversation.update({ where: { id: conversationId }, data: { status: "COMPLETED" } });
    await job.updateProgress(100);

    log.info("MCP flow job completed", { jobId: job.id, taskId, agentId, durationMs });

    return output;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await markFailed(taskId, errorMsg);
    if (conversationId) {
      await prisma.conversation
        .update({ where: { id: conversationId }, data: { status: "ABANDONED" } })
        .catch(() => undefined);
    }
    log.error("MCP flow job failed", { jobId: job.id, taskId, agentId, error: err });
    throw err;
  }
}

/**
 * P5: Processes SDLC pipeline run jobs.
 * Delegates to the orchestrator which runs each step sequentially,
 * fires learn hooks between steps, and checks cancellation.
 */
async function processPipelineRunJob(job: Job<PipelineRunJobData>): Promise<unknown> {
  const {
    pipelineRunId, agentId, userId, modelId,
    requireApproval, startFromStep, existingStepResults, approvalFeedback,
    useSmartRouting, repoUrl,
  } = job.data;

  const {
    getPipelineRun,
    markPipelineRunning,
    markPipelineCompleted,
    markPipelineFailed,
    advancePipelineStep,
    isPipelineCancelled,
    markPipelineAwaitingApproval,
  } = await import("@/lib/sdlc/pipeline-manager");

  const { runPipeline } = await import("@/lib/sdlc/orchestrator");

  // Load the pipeline run record
  const run = await getPipelineRun(pipelineRunId);
  if (!run) {
    throw new Error(`Pipeline run ${pipelineRunId} not found`);
  }

  // Mark as RUNNING
  await markPipelineRunning(pipelineRunId, job.id ?? `pipeline-run-${pipelineRunId}`);
  await job.updateProgress(5);

  try {
    const result = await runPipeline(
      {
        runId: pipelineRunId,
        agentId,
        userId,
        taskDescription: run.taskDescription,
        pipeline: run.pipeline,
        modelId,
        startFromStep,
        existingStepResults,
        requireApproval: requireApproval ?? false,
        approvalFeedback,
        useSmartRouting: useSmartRouting ?? false,
        repoUrl,
      },
      {
        onStepComplete: async (stepIdx: number, output: string) => {
          await advancePipelineStep(pipelineRunId, stepIdx, output);
        },
        isCancelled: async () => isPipelineCancelled(pipelineRunId),
        onProgress: async (pct: number) => {
          await job.updateProgress(pct);
        },
      },
    );

    if (result.awaitingApproval) {
      await markPipelineAwaitingApproval(pipelineRunId);
      logger.info("Pipeline paused — awaiting human approval", {
        pipelineRunId, agentId, planningStepsCompleted: result.planningStepsCompleted,
      });
      return { pipelineRunId, awaitingApproval: true };
    }

    if (result.cancelled) {
      // Pipeline was cancelled mid-run — DB already updated by cancel route
      logger.info("Pipeline run was cancelled mid-execution", { pipelineRunId });
      return { pipelineRunId, cancelled: true };
    }

    await markPipelineCompleted(pipelineRunId, result.finalOutput, result.prUrl, result.gitError);
    await job.updateProgress(100);

    // Fire-and-forget: persist per-step metrics and aggregate model stats
    void (async () => {
      const { recordAllStepMetrics, aggregateRunMetrics } = await import("@/lib/sdlc/metrics-collector");
      await recordAllStepMetrics(pipelineRunId, result.stepMetrics ?? {});
      await aggregateRunMetrics(pipelineRunId);
    })();

    // Fire-and-forget: extract and persist learnings from this run
    const stepResultsMap = run.stepResults as Record<string, string>;
    void (async () => {
      const { extractAndSaveMemory } = await import("@/lib/sdlc/pipeline-memory");
      await extractAndSaveMemory(
        pipelineRunId,
        agentId,
        run.taskDescription,
        Object.values(stepResultsMap),
      );
    })();

    logger.info("Pipeline run job completed", {
      jobId: job.id,
      pipelineRunId,
      agentId,
      stepCount: result.stepCount,
      durationMs: result.durationMs,
      totalInputTokens: result.totalInputTokens,
      totalOutputTokens: result.totalOutputTokens,
    });

    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await markPipelineFailed(pipelineRunId, errorMsg);
    logger.error("Pipeline run job failed", { jobId: job.id, pipelineRunId, agentId, error: err });
    throw err; // Re-throw so BullMQ records the failure
  }
}

/**
 * Fire-and-forget HTTP POST to the task's callbackUrl.
 * Retries once on failure. Errors are logged but never propagated.
 * Payload is capped at 100KB to prevent oversized POST bodies.
 */
const CALLBACK_MAX_PAYLOAD_BYTES = 100_000;
const CALLBACK_MAX_RETRIES = 1;

async function fireTaskCallback(
  url: string,
  payload: Record<string, unknown>,
): Promise<void> {
  let body: string;
  try {
    body = JSON.stringify(payload);
    if (body.length > CALLBACK_MAX_PAYLOAD_BYTES) {
      // Truncate the result field to fit
      const truncated = { ...payload, output: { ...(payload.output as Record<string, unknown> | undefined), result: "[truncated — output too large for callback]" } };
      body = JSON.stringify(truncated);
      logger.warn("Managed task callback payload truncated", {
        url,
        taskId: payload.taskId,
        originalSize: JSON.stringify(payload).length,
      });
    }
  } catch (err) {
    logger.warn("Managed task callback payload serialization failed", {
      url,
      taskId: payload.taskId,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  for (let attempt = 0; attempt <= CALLBACK_MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) return; // success

      logger.warn("Managed task callback returned non-2xx", {
        url,
        status: res.status,
        taskId: payload.taskId,
        attempt,
      });
    } catch (err) {
      logger.warn("Managed task callback failed", {
        url,
        taskId: payload.taskId,
        attempt,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Wait 2s before retry
    if (attempt < CALLBACK_MAX_RETRIES) {
      await new Promise<void>((r) => setTimeout(r, 2000));
    }
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
