/**
 * BullMQ Queue Configuration
 *
 * Job types:
 *   - flow.execute: Execute a flow (chat message or direct trigger)
 *   - flow.execute.streaming: Execute with NDJSON streaming
 *   - eval.run: Run an eval suite
 *
 * Priority levels:
 *   1 (highest): chat — user is waiting for response
 *   5 (normal): pipeline — background flow execution
 *   10 (low): eval — batch testing
 */

import { Queue, type ConnectionOptions } from "bullmq";
import { logger } from "@/lib/logger";

const QUEUE_NAME = "agent-studio";

export interface FlowExecuteJobData {
  type: "flow.execute";
  agentId: string;
  conversationId: string;
  userMessage?: string;
  userId?: string;
  streaming: boolean;
  priority: "chat" | "pipeline" | "eval";
}

export interface EvalRunJobData {
  type: "eval.run";
  suiteId: string;
  agentId: string;
  triggeredBy: "manual" | "deploy" | "schedule";
  baseUrl: string;
  authHeader?: string;
}

export type JobData = FlowExecuteJobData | EvalRunJobData;

const PRIORITY_MAP: Record<string, number> = {
  chat: 1,
  pipeline: 5,
  eval: 10,
};

function getConnection(): ConnectionOptions {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is required for job queue");
  }
  return { url };
}

let queue: Queue<JobData> | null = null;

export function getQueue(): Queue<JobData> {
  if (queue) return queue;

  queue = new Queue<JobData>(QUEUE_NAME, {
    connection: getConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      removeOnComplete: {
        age: 86400,
        count: 1000,
      },
      removeOnFail: {
        age: 604800,
      },
    },
  });

  logger.info("BullMQ queue initialized", { name: QUEUE_NAME });

  return queue;
}

export async function addFlowJob(
  data: Omit<FlowExecuteJobData, "type">,
): Promise<string> {
  const q = getQueue();
  const priority = PRIORITY_MAP[data.priority] ?? 5;

  const job = await q.add(
    "flow.execute",
    { ...data, type: "flow.execute" },
    {
      priority,
      jobId: `flow-${data.conversationId}-${Date.now()}`,
    },
  );

  logger.info("Flow job added", {
    jobId: job.id,
    agentId: data.agentId,
    priority: data.priority,
    streaming: data.streaming,
  });

  return job.id ?? `flow-${data.conversationId}`;
}

export async function addEvalJob(
  data: Omit<EvalRunJobData, "type">,
): Promise<string> {
  const q = getQueue();

  const job = await q.add(
    "eval.run",
    { ...data, type: "eval.run" },
    {
      priority: PRIORITY_MAP.eval,
      jobId: `eval-${data.suiteId}-${Date.now()}`,
    },
  );

  logger.info("Eval job added", {
    jobId: job.id,
    suiteId: data.suiteId,
    agentId: data.agentId,
  });

  return job.id ?? `eval-${data.suiteId}`;
}

export async function getJobStatus(jobId: string): Promise<{
  state: string;
  progress: number;
  result?: unknown;
  failedReason?: string;
} | null> {
  const q = getQueue();
  const job = await q.getJob(jobId);
  if (!job) return null;

  const state = await job.getState();

  return {
    state,
    progress: typeof job.progress === "number" ? job.progress : 0,
    result: job.returnvalue,
    failedReason: job.failedReason,
  };
}

export async function closeQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}
