/**
 * Schedule Failure Notification Service (P2-T5)
 *
 * Sends alerts when scheduled flows fail or circuit breaker auto-disables.
 * Supports two channels:
 *   1. Webhook callback — POST to FlowSchedule.failureWebhookUrl (Slack/Discord/PagerDuty)
 *   2. Structured logging — always fires, provides audit trail
 *
 * All notifications are fire-and-forget — failures never block the cron pipeline.
 */

import { logger } from "@/lib/logger";

const WEBHOOK_TIMEOUT_MS = 5_000;

export interface FailureEvent {
  scheduleId: string;
  agentId: string;
  executionId: string;
  error: string;
  durationMs: number;
  failureCount: number;
  maxRetries: number;
  autoDisabled: boolean;
  scheduledAt: string;
  failureWebhookUrl?: string | null;
}

/**
 * Sends failure notification for a scheduled flow execution.
 * Fire-and-forget — never throws.
 */
export async function notifyScheduleFailure(event: FailureEvent): Promise<void> {
  try {
    logFailureEvent(event);

    if (event.failureWebhookUrl) {
      await sendWebhookNotification(event.failureWebhookUrl, event);
    }
  } catch (err) {
    logger.warn("Schedule failure notification error", {
      error: err instanceof Error ? err.message : String(err),
      scheduleId: event.scheduleId,
    });
  }
}

/**
 * Sends circuit breaker open notification when a schedule is auto-disabled.
 */
export async function notifyCircuitBreakerOpen(event: FailureEvent): Promise<void> {
  try {
    logger.error("Schedule circuit breaker OPEN — auto-disabled", {
      scheduleId: event.scheduleId,
      agentId: event.agentId,
      failureCount: event.failureCount,
      maxRetries: event.maxRetries,
    });

    if (event.failureWebhookUrl) {
      await sendWebhookNotification(event.failureWebhookUrl, {
        ...event,
        error: `CIRCUIT BREAKER OPEN: Schedule auto-disabled after ${event.failureCount} consecutive failures. Last error: ${event.error}`,
      });
    }
  } catch (err) {
    logger.warn("Circuit breaker notification error", {
      error: err instanceof Error ? err.message : String(err),
      scheduleId: event.scheduleId,
    });
  }
}

function logFailureEvent(event: FailureEvent): void {
  const level = event.autoDisabled ? "error" : "warn";
  const message = event.autoDisabled
    ? "Scheduled flow FAILED — circuit breaker triggered"
    : "Scheduled flow FAILED";

  logger[level](message, {
    scheduleId: event.scheduleId,
    agentId: event.agentId,
    executionId: event.executionId,
    error: event.error,
    durationMs: event.durationMs,
    failureCount: event.failureCount,
    maxRetries: event.maxRetries,
    autoDisabled: event.autoDisabled,
  });
}

/**
 * Sends a POST request to the configured webhook URL with failure details.
 * Formats as a Slack-compatible payload (works with Slack, Discord, Teams webhooks).
 */
export async function sendWebhookNotification(
  url: string,
  event: FailureEvent
): Promise<void> {
  const statusText = event.autoDisabled
    ? "CIRCUIT BREAKER — Schedule Auto-Disabled"
    : "Schedule Execution Failed";

  const payload = {
    text: statusText,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: [
            `*${statusText}*`,
            `*Schedule:* \`${event.scheduleId}\``,
            `*Agent:* \`${event.agentId}\``,
            `*Error:* ${event.error}`,
            `*Failures:* ${event.failureCount}/${event.maxRetries}`,
            `*Duration:* ${event.durationMs}ms`,
            `*Time:* ${event.scheduledAt}`,
          ].join("\n"),
        },
      },
    ],
    event: {
      scheduleId: event.scheduleId,
      agentId: event.agentId,
      executionId: event.executionId,
      error: event.error,
      failureCount: event.failureCount,
      maxRetries: event.maxRetries,
      autoDisabled: event.autoDisabled,
      durationMs: event.durationMs,
      scheduledAt: event.scheduledAt,
    },
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });

    if (!response.ok) {
      logger.warn("Failure webhook returned non-OK status", {
        status: response.status,
        scheduleId: event.scheduleId,
      });
    }
  } catch (err) {
    logger.warn("Failure webhook request failed", {
      error: err instanceof Error ? err.message : String(err),
      scheduleId: event.scheduleId,
    });
  }
}
