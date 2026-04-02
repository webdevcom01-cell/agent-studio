/**
 * Job Progress Events — SSE bridge for real-time job status.
 *
 * Usage in API routes:
 *   const stream = createJobEventStream(jobId);
 *   return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
 */

import { type Job, QueueEvents } from "bullmq";
import { getQueue } from "./index";
import { logger } from "@/lib/logger";

export interface JobEvent {
  type: "progress" | "completed" | "failed" | "active";
  jobId: string;
  data: Record<string, unknown>;
}

let queueEvents: QueueEvents | null = null;

function getQueueEvents(): QueueEvents {
  if (queueEvents) return queueEvents;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error("REDIS_URL required for job events");
  }

  queueEvents = new QueueEvents("agent-studio", {
    connection: { url: redisUrl },
  });

  return queueEvents;
}

/**
 * Creates a ReadableStream that emits SSE events for a specific job.
 * Stream auto-closes when job completes or fails.
 */
export function createJobEventStream(jobId: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const events = getQueueEvents();
      const queue = getQueue();

      function send(event: JobEvent): void {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        } catch {
          // Stream closed
        }
      }

      // Send current state immediately
      const job = await queue.getJob(jobId);
      if (job) {
        const state = await job.getState();
        send({
          type: state === "active" ? "active" : "progress",
          jobId,
          data: {
            state,
            progress: typeof job.progress === "number" ? job.progress : 0,
          },
        });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const onProgress = (args: { jobId: string; data: any }, _id: string) => {
        if (args.jobId !== jobId) return;
        send({
          type: "progress",
          jobId,
          data: {
            progress: typeof args.data === "number" ? args.data : 0,
          },
        });
      };

      const onCompleted = async (args: { jobId: string; returnvalue: string }) => {
        if (args.jobId !== jobId) return;
        let result: unknown = null;
        try {
          result = JSON.parse(args.returnvalue);
        } catch {
          result = args.returnvalue;
        }
        send({
          type: "completed",
          jobId,
          data: { result },
        });
        cleanup();
        controller.close();
      };

      const onFailed = (args: { jobId: string; failedReason: string }) => {
        if (args.jobId !== jobId) return;
        send({
          type: "failed",
          jobId,
          data: { error: args.failedReason },
        });
        cleanup();
        controller.close();
      };

      function cleanup(): void {
        events.off("progress", onProgress);
        events.off("completed", onCompleted);
        events.off("failed", onFailed);
      }

      events.on("progress", onProgress);
      events.on("completed", onCompleted);
      events.on("failed", onFailed);

      // Safety timeout: close stream after 5 minutes
      setTimeout(() => {
        cleanup();
        try { controller.close(); } catch { /* already closed */ }
      }, 300_000);
    },
  });
}

export async function closeQueueEvents(): Promise<void> {
  if (queueEvents) {
    await queueEvents.close();
    queueEvents = null;
  }
}
