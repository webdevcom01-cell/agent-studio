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
import type { JobData, FlowExecuteJobData, EvalRunJobData } from "./index";

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
  createWorker();
  const port = Number(process.env.PORT) || 8080;
  startHealthServer(port);
}
