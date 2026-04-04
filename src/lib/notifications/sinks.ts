/**
 * Notification Sinks — Phase E2.3
 *
 * Three sinks: Webhook, InApp, Log.
 * Each delivers a RenderedMessage to its destination.
 * Never throws — always returns DeliveryResult.
 */

import type { NotificationSink, RenderedMessage, DeliveryResult, SinkConfig } from "./types";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// WebhookSink
// ---------------------------------------------------------------------------

export class WebhookSink implements NotificationSink {
  readonly name = "webhook";

  async deliver(rendered: RenderedMessage, config: SinkConfig): Promise<DeliveryResult> {
    const url = config.webhookUrl;
    if (!url) {
      return {
        success: false,
        channel: "webhook",
        error: "No webhook URL configured",
      };
    }

    const timeoutMs = config.timeoutMs ?? 15000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rendered.body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        logger.warn("Webhook sink: non-OK response", {
          agentId: config.agentId,
          status: response.status,
        });
        return {
          success: false,
          channel: "webhook",
          status: response.status,
          error: `HTTP ${response.status}`,
        };
      }

      logger.info("Webhook sink: delivered", { agentId: config.agentId });
      return { success: true, channel: "webhook", status: response.status };
    } catch (error) {
      clearTimeout(timeoutId);
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.warn("Webhook sink: delivery failed", {
        agentId: config.agentId,
        error: errMsg,
      });
      return { success: false, channel: "webhook", error: errMsg };
    }
  }
}

// ---------------------------------------------------------------------------
// InAppSink
// ---------------------------------------------------------------------------

/**
 * InAppSink doesn't actually "deliver" anywhere — it returns the rendered
 * text so the notification handler can include it as an assistant message.
 * The handler reads `rendered.text` and pushes it into the response messages.
 */
export class InAppSink implements NotificationSink {
  readonly name = "in_app";

  async deliver(rendered: RenderedMessage, config: SinkConfig): Promise<DeliveryResult> {
    logger.info("InApp sink: notification recorded", {
      agentId: config.agentId,
      level: rendered.level,
    });
    return { success: true, channel: "in_app" };
  }
}

// ---------------------------------------------------------------------------
// LogSink
// ---------------------------------------------------------------------------

export class LogSink implements NotificationSink {
  readonly name = "log";

  async deliver(rendered: RenderedMessage, config: SinkConfig): Promise<DeliveryResult> {
    if (rendered.level === "error") {
      logger.error(`[Notification] ${rendered.text}`, undefined, {
        agentId: config.agentId,
        level: rendered.level,
      });
    } else {
      logger.info(`[Notification] ${rendered.text}`, {
        agentId: config.agentId,
        level: rendered.level,
      });
    }
    return { success: true, channel: "log" };
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const SINKS: Record<string, NotificationSink> = {
  webhook: new WebhookSink(),
  in_app: new InAppSink(),
  log: new LogSink(),
};

/**
 * Get a sink by name. Falls back to LogSink for unknown names.
 */
export function getSink(name: string): NotificationSink {
  return SINKS[name] ?? SINKS.log;
}
