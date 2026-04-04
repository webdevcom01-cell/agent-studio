/**
 * Session Event System — Phase E1
 *
 * Typed lifecycle events emitted at key flow execution milestones.
 * Inspired by clawhip's session.* event pipeline.
 *
 * Events are emitted via the existing FlowHookRegistry (Phase A hooks)
 * and can trigger notifications via configurable sessionNotifications.
 */

import { logger } from "@/lib/logger";
import type { RuntimeContext, FlowHookPayload } from "./types";

// ---------------------------------------------------------------------------
// Session Event Types
// ---------------------------------------------------------------------------

export type SessionEventType =
  | "session.started"
  | "session.finished"
  | "session.failed"
  | "session.timeout"
  | "session.blocked"
  | "session.verification_passed"
  | "session.verification_failed";

export const ALL_SESSION_EVENT_TYPES: readonly SessionEventType[] = [
  "session.started",
  "session.finished",
  "session.failed",
  "session.timeout",
  "session.blocked",
  "session.verification_passed",
  "session.verification_failed",
] as const;

// ---------------------------------------------------------------------------
// Session Notification Config (stored in FlowContent JSON)
// ---------------------------------------------------------------------------

export interface SessionNotificationConfig {
  /** Which session events trigger notifications */
  events: SessionEventType[];
  /** Notification channel */
  channel: "webhook" | "in_app" | "log";
  /** Webhook URL — required when channel is "webhook" */
  webhookUrl?: string;
  /** Format preset — controls message formatting */
  format?: "plain" | "discord" | "slack";
}

// ---------------------------------------------------------------------------
// Session Event Payload
// ---------------------------------------------------------------------------

export interface SessionEventPayload {
  event: SessionEventType;
  agentId: string;
  conversationId: string;
  timestamp: number;
  /** Duration in ms (present for finished/failed/timeout) */
  durationMs?: number;
  /** Iteration count at the time of the event */
  iterations?: number;
  /** Error message (present for failed events) */
  error?: string;
  /** Extra metadata */
  meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Emit Session Event
// ---------------------------------------------------------------------------

/**
 * Emit a session event through the hook registry and deliver notifications.
 * Fire-and-forget — never throws, never blocks the flow.
 */
export function emitSessionEvent(
  context: RuntimeContext,
  event: SessionEventType,
  extra?: Partial<SessionEventPayload>,
): void {
  try {
    const payload: SessionEventPayload = {
      event,
      agentId: context.agentId,
      conversationId: context.conversationId,
      timestamp: Date.now(),
      ...extra,
    };

    // Emit through existing hook registry if available
    if (context.hooks) {
      const hookPayload: FlowHookPayload = {
        event: "onFlowStart", // we piggyback on the hook system's emit
        agentId: payload.agentId,
        conversationId: payload.conversationId,
        timestamp: payload.timestamp,
        meta: {
          sessionEvent: payload.event,
          ...payload.meta,
          ...(payload.durationMs != null ? { durationMs: payload.durationMs } : {}),
          ...(payload.iterations != null ? { iterations: payload.iterations } : {}),
          ...(payload.error ? { error: payload.error } : {}),
        },
      };
      context.hooks.emit(hookPayload);
    }

    // Deliver session notifications if configured
    const config = getSessionNotificationConfig(context);
    if (config && config.events.includes(event)) {
      deliverSessionNotification(config, payload).catch(() => {
        // fire-and-forget
      });
    }

    logger.info("Session event emitted", {
      event,
      agentId: context.agentId,
      conversationId: context.conversationId,
    });
  } catch {
    // Never crash the flow
    logger.warn("Failed to emit session event", { event, agentId: context.agentId });
  }
}

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

/**
 * Extract sessionNotifications config from FlowContent.
 * Returns null if not configured.
 */
export function getSessionNotificationConfig(
  context: RuntimeContext,
): SessionNotificationConfig | null {
  const fc = context.flowContent as unknown as Record<string, unknown>;
  const raw = fc.sessionNotifications;
  if (!raw || typeof raw !== "object") return null;

  const cfg = raw as Record<string, unknown>;
  const events = Array.isArray(cfg.events)
    ? (cfg.events as string[]).filter((e): e is SessionEventType =>
        ALL_SESSION_EVENT_TYPES.includes(e as SessionEventType))
    : [];

  if (events.length === 0) return null;

  const channel = (cfg.channel as string) ?? "log";
  if (channel !== "webhook" && channel !== "in_app" && channel !== "log") return null;

  return {
    events,
    channel,
    webhookUrl: typeof cfg.webhookUrl === "string" ? cfg.webhookUrl : undefined,
    format: isValidFormat(cfg.format) ? cfg.format : "plain",
  };
}

function isValidFormat(v: unknown): v is "plain" | "discord" | "slack" {
  return v === "plain" || v === "discord" || v === "slack";
}

// ---------------------------------------------------------------------------
// Notification Delivery
// ---------------------------------------------------------------------------

/**
 * Deliver a session notification based on config.
 * Fire-and-forget — errors are logged but never thrown.
 */
async function deliverSessionNotification(
  config: SessionNotificationConfig,
  payload: SessionEventPayload,
): Promise<void> {
  const formatted = formatSessionMessage(payload, config.format ?? "plain");

  if (config.channel === "log") {
    const logFn = payload.event === "session.failed" ? logger.error : logger.info;
    if (payload.event === "session.failed") {
      logFn(`[Session] ${formatted.text}`, undefined, {
        agentId: payload.agentId,
        event: payload.event,
      });
    } else {
      logFn(`[Session] ${formatted.text}`, {
        agentId: payload.agentId,
        event: payload.event,
      });
    }
    return;
  }

  if (config.channel === "in_app") {
    // In-app notifications are handled by the chat messages —
    // the engine itself pushes an assistant message when relevant.
    // We just log here for auditability.
    logger.info("[Session] in_app notification recorded", {
      agentId: payload.agentId,
      event: payload.event,
    });
    return;
  }

  if (config.channel === "webhook" && config.webhookUrl) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      await fetch(config.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formatted.body),
        signal: controller.signal,
      });
    } catch {
      logger.warn("Session notification webhook failed", {
        agentId: payload.agentId,
        event: payload.event,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// ---------------------------------------------------------------------------
// Message Formatting
// ---------------------------------------------------------------------------

interface FormattedMessage {
  text: string;
  body: Record<string, unknown>;
}

const EVENT_LABELS: Record<SessionEventType, string> = {
  "session.started": "Session Started",
  "session.finished": "Session Finished",
  "session.failed": "Session Failed",
  "session.timeout": "Session Timeout",
  "session.blocked": "Waiting for Approval",
  "session.verification_passed": "Verification Passed",
  "session.verification_failed": "Verification Failed",
};

const EVENT_EMOJI: Record<SessionEventType, string> = {
  "session.started": "🚀",
  "session.finished": "✅",
  "session.failed": "❌",
  "session.timeout": "⏰",
  "session.blocked": "⏸️",
  "session.verification_passed": "✅",
  "session.verification_failed": "❌",
};

const DISCORD_COLORS: Record<SessionEventType, number> = {
  "session.started": 0x3498db,   // blue
  "session.finished": 0x2ecc71,  // green
  "session.failed": 0xe74c3c,    // red
  "session.timeout": 0xf39c12,   // orange
  "session.blocked": 0x9b59b6,   // purple
  "session.verification_passed": 0x2ecc71,
  "session.verification_failed": 0xe74c3c,
};

/**
 * Format a session event for delivery. Supports plain, Discord, and Slack presets.
 */
export function formatSessionMessage(
  payload: SessionEventPayload,
  format: "plain" | "discord" | "slack",
): FormattedMessage {
  const label = EVENT_LABELS[payload.event];
  const emoji = EVENT_EMOJI[payload.event];
  const durationStr = payload.durationMs != null
    ? ` (${(payload.durationMs / 1000).toFixed(1)}s)`
    : "";
  const errorStr = payload.error ? ` — ${payload.error}` : "";
  const plainText = `${emoji} ${label}${durationStr}${errorStr}`;

  if (format === "discord") {
    const fields: Array<{ name: string; value: string; inline: boolean }> = [
      { name: "Agent", value: payload.agentId.slice(0, 12), inline: true },
    ];
    if (payload.iterations != null) {
      fields.push({ name: "Iterations", value: String(payload.iterations), inline: true });
    }
    if (payload.durationMs != null) {
      fields.push({ name: "Duration", value: `${(payload.durationMs / 1000).toFixed(1)}s`, inline: true });
    }
    if (payload.error) {
      fields.push({ name: "Error", value: payload.error.slice(0, 200), inline: false });
    }

    return {
      text: plainText,
      body: {
        embeds: [{
          title: `${emoji} ${label}`,
          color: DISCORD_COLORS[payload.event],
          fields,
          timestamp: new Date(payload.timestamp).toISOString(),
        }],
      },
    };
  }

  if (format === "slack") {
    const blocks: Array<Record<string, unknown>> = [
      {
        type: "header",
        text: { type: "plain_text", text: `${emoji} ${label}`, emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Agent:* \`${payload.agentId.slice(0, 12)}\`` },
          ...(payload.iterations != null
            ? [{ type: "mrkdwn", text: `*Iterations:* ${payload.iterations}` }]
            : []),
          ...(payload.durationMs != null
            ? [{ type: "mrkdwn", text: `*Duration:* ${(payload.durationMs / 1000).toFixed(1)}s` }]
            : []),
        ],
      },
    ];
    if (payload.error) {
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*Error:* ${payload.error.slice(0, 200)}` },
      });
    }

    return {
      text: plainText,
      body: { text: plainText, blocks },
    };
  }

  // Plain format — generic webhook payload
  return {
    text: plainText,
    body: {
      text: plainText,
      event: payload.event,
      agentId: payload.agentId,
      conversationId: payload.conversationId,
      timestamp: new Date(payload.timestamp).toISOString(),
      ...(payload.durationMs != null ? { durationMs: payload.durationMs } : {}),
      ...(payload.iterations != null ? { iterations: payload.iterations } : {}),
      ...(payload.error ? { error: payload.error } : {}),
    },
  };
}
