/**
 * Notification System — Phase E2
 *
 * Renderer/Sink split pattern inspired by clawhip's event pipeline.
 * Renderers format messages; Sinks deliver them. Fully composable.
 */

// ---------------------------------------------------------------------------
// Core Interfaces
// ---------------------------------------------------------------------------

/** Input to the notification system */
export interface NotificationInput {
  title: string;
  message: string;
  level: "info" | "warning" | "error" | "success";
  agentId: string;
  timestamp: string;
  /** Extra metadata for template resolution */
  meta?: Record<string, unknown>;
}

/** Output of a renderer — ready for a sink to deliver */
export interface RenderedMessage {
  /** Plain-text fallback */
  text: string;
  /** Structured body for webhook delivery (JSON-serializable) */
  body: Record<string, unknown>;
  /** Original level preserved for sink-level routing */
  level: "info" | "warning" | "error" | "success";
}

/** Result of a sink delivery attempt */
export interface DeliveryResult {
  success: boolean;
  channel: string;
  error?: string;
  /** HTTP status when applicable */
  status?: number;
}

// ---------------------------------------------------------------------------
// Renderer Interface
// ---------------------------------------------------------------------------

/** Formats a notification input into a platform-specific message */
export interface NotificationRenderer {
  /** Unique renderer name */
  readonly name: string;
  /** Render notification input into a deliverable message */
  render(input: NotificationInput): RenderedMessage;
}

// ---------------------------------------------------------------------------
// Sink Interface
// ---------------------------------------------------------------------------

/** Delivers a rendered message to a destination */
export interface NotificationSink {
  /** Unique sink name (e.g., "webhook", "in_app", "log") */
  readonly name: string;
  /** Deliver a rendered message. Never throws — returns DeliveryResult. */
  deliver(
    rendered: RenderedMessage,
    config: SinkConfig,
  ): Promise<DeliveryResult>;
}

/** Configuration for sink delivery */
export interface SinkConfig {
  /** Webhook URL — required for webhook sink */
  webhookUrl?: string;
  /** Webhook URL from runtime variable */
  webhookUrlVariable?: string;
  /** Timeout in ms for webhook delivery */
  timeoutMs?: number;
  /** Agent ID for context */
  agentId: string;
}

// ---------------------------------------------------------------------------
// Renderer/Sink Registry Names
// ---------------------------------------------------------------------------

export type RendererName = "plain" | "discord" | "slack" | "markdown";
export type SinkName = "webhook" | "in_app" | "log";
