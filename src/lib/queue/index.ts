/**
 * BullMQ Queue Configuration
 *
 * Job types:
 *   - flow.execute: Execute a flow (chat message or direct trigger)
 *   - flow.execute.streaming: Execute with NDJSON streaming
 *   - eval.run: Run an eval suite
 *   - managed.task.run: Run a ManagedAgentTask (P4 — long-running async tasks)
 *
 * Priority levels:
 *   1 (highest): chat — user is waiting for response
 *   5 (normal): pipeline — background flow execution
 *   8 (background): managed — long-running tasks
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

export interface WebhookRetryJobData {
  type: "webhook.retry";
  agentId: string;
  webhookId: string;
  executionId: string;
  /** Retry attempt number (1 = first retry, 2 = second, etc.) */
  retryCount: number;
}

export interface KBIngestJobData {
  type: "kb.ingest";
  sourceId: string;
  /** Pre-extracted text content (for TEXT type sources). URL/FILE sources re-fetch from DB. */
  content?: string;
}

/**
 * v2: Async webhook execution job.
 * Dispatched by the webhook route when asyncExecution=true on the WebhookConfig.
 * The worker calls executeWebhookTrigger with isAsyncWorker=true.
 */
export interface WebhookExecuteJobData {
  type: "webhook.execute";
  agentId: string;
  webhookId: string;
  executionId: string;
  rawBody: string;
  headers: Record<string, string>;
  sourceIp?: string;
}

/** P4 — Managed Agent Task (long-running async execution via claude_agent_sdk) */
export interface ManagedTaskRunJobData {
  type: "managed.task.run";
  taskId: string;
  agentId: string;
  userId?: string;
}

/** MCP — Async flow execution triggered via MCP trigger_agent tool */
export interface McpFlowRunJobData {
  type: "mcp.flow.run";
  taskId: string;
  agentId: string;
  userId: string;
  message: string;
  variables: Record<string, unknown>;
}

/** P5 — SDLC Pipeline Run (multi-agent sequential execution via meta-orchestrator) */
export interface PipelineRunJobData {
  type: "pipeline.run";
  pipelineRunId: string;
  agentId: string;
  userId?: string;
  /** Optional model override (defaults to claude-sonnet-4-6 in the orchestrator) */
  modelId?: string;
}

export type JobData =
  | FlowExecuteJobData
  | EvalRunJobData
  | WebhookRetryJobData
  | KBIngestJobData
  | WebhookExecuteJobData
  | ManagedTaskRunJobData
  | McpFlowRunJobData
  | PipelineRunJobData;

const PRIORITY_MAP: Record<string, number> = {
  chat: 1,
  pipeline: 5,
  managed: 8,
  sdlc: 8,     // P5 SDLC pipelines — same tier as managed tasks
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

export async function addWebhookRetryJob(
  data: Omit<WebhookRetryJobData, "type">,
  delayMs: number,
): Promise<string> {
  const q = getQueue();

  const job = await q.add(
    "webhook.retry",
    { ...data, type: "webhook.retry" as const },
    {
      delay: delayMs,
      // Priority 3: higher than pipeline (5) so retries run before batch jobs,
      // but lower than live chat (1) so interactive users are never starved.
      priority: 3,
      // Stable job ID prevents double-scheduling if the scheduler runs twice.
      jobId: `webhook-retry-${data.executionId}-${data.retryCount}`,
      removeOnComplete: { age: 86400 },
      removeOnFail: { age: 604800 },
    },
  );

  logger.info("Webhook retry job scheduled", {
    jobId: job.id,
    executionId: data.executionId,
    webhookId: data.webhookId,
    delayMs,
    retryCount: data.retryCount,
  });

  return job.id ?? `webhook-retry-${data.executionId}-${data.retryCount}`;
}

export async function addKBIngestJob(
  data: Omit<KBIngestJobData, "type">,
): Promise<string> {
  const q = getQueue();

  const job = await q.add(
    "kb.ingest",
    { ...data, type: "kb.ingest" as const },
    {
      priority: 5,
      jobId: `kb-ingest-${data.sourceId}-${Date.now()}`,
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 604800 },
    },
  );

  logger.info("KB ingest job added", {
    jobId: job.id,
    sourceId: data.sourceId,
  });

  return job.id ?? `kb-ingest-${data.sourceId}`;
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

/**
 * v2: Enqueue an async webhook execution job.
 * Called by the webhook route when asyncExecution=true so it can return 202 immediately.
 */
export async function addWebhookExecuteJob(
  data: Omit<WebhookExecuteJobData, "type">,
): Promise<string> {
  const q = getQueue();

  const job = await q.add(
    "webhook.execute",
    { ...data, type: "webhook.execute" as const },
    {
      // Priority 2: between live chat (1) and pipeline (5) — webhook triggers
      // are user-facing but not as latency-sensitive as interactive chat.
      priority: 2,
      // Stable job ID prevents double-scheduling if the route is called twice
      // for the same execution record.
      jobId: `webhook-exec-${data.executionId}`,
      removeOnComplete: { age: 86400 },
      removeOnFail: { age: 604800 },
    },
  );

  logger.info("Webhook execute job enqueued", {
    jobId: job.id,
    executionId: data.executionId,
    agentId: data.agentId,
    webhookId: data.webhookId,
  });

  return job.id ?? `webhook-exec-${data.executionId}`;
}

/**
 * P4: Enqueue a managed agent task for async execution.
 * Priority 8 — background, below pipeline (5), above eval (10).
 */
export async function addManagedTaskJob(
  data: Omit<ManagedTaskRunJobData, "type">
): Promise<string> {
  const q = getQueue();

  const job = await q.add(
    "managed.task.run",
    { ...data, type: "managed.task.run" as const },
    {
      priority: PRIORITY_MAP.managed,
      jobId: `managed-task-${data.taskId}`,
      attempts: 1, // managed tasks do not auto-retry — failure is explicit
      removeOnComplete: { age: 86400 },
      removeOnFail: { age: 604800 },
    }
  );

  logger.info("Managed task job enqueued", {
    jobId: job.id,
    taskId: data.taskId,
    agentId: data.agentId,
  });

  return job.id ?? `managed-task-${data.taskId}`;
}

/**
 * P5: Enqueue a SDLC pipeline run for async multi-agent execution.
 * Priority 8 — same tier as managed tasks (background, not user-interactive).
 */
export async function addPipelineRunJob(
  data: Omit<PipelineRunJobData, "type">,
): Promise<string> {
  const q = getQueue();

  const job = await q.add(
    "pipeline.run",
    { ...data, type: "pipeline.run" as const },
    {
      priority: PRIORITY_MAP.sdlc,
      jobId: `pipeline-run-${data.pipelineRunId}`,
      attempts: 1, // SDLC pipeline runs do not auto-retry — failure is explicit
      removeOnComplete: { age: 86400 },
      removeOnFail: { age: 604800 },
    },
  );

  logger.info("Pipeline run job enqueued", {
    jobId: job.id,
    pipelineRunId: data.pipelineRunId,
    agentId: data.agentId,
  });

  return job.id ?? `pipeline-run-${data.pipelineRunId}`;
}

/**
 * MCP: Enqueue an async flow execution triggered by the MCP trigger_agent tool.
 * Priority 5 (pipeline) — not interactive, but higher than background managed tasks.
 */
export async function addMcpFlowJob(
  data: Omit<McpFlowRunJobData, "type">,
): Promise<string> {
  const q = getQueue();

  const job = await q.add(
    "mcp.flow.run",
    { ...data, type: "mcp.flow.run" as const },
    {
      priority: PRIORITY_MAP.pipeline,
      jobId: `mcp-flow-${data.taskId}`,
      attempts: 1, // MCP flow runs do not auto-retry — caller polls status
      removeOnComplete: { age: 86400 },
      removeOnFail: { age: 604800 },
    },
  );

  logger.info("MCP flow job enqueued", {
    jobId: job.id,
    taskId: data.taskId,
    agentId: data.agentId,
  });

  return job.id ?? `mcp-flow-${data.taskId}`;
}

export async function closeQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}
