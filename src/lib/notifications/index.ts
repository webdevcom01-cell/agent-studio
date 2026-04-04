/**
 * Notification System — Phase E2
 *
 * Renderer/Sink pattern for extensible notification delivery.
 * Add new renderers (Telegram, Teams) or sinks (email, SMS) without
 * touching existing code.
 */

export type {
  NotificationInput,
  RenderedMessage,
  DeliveryResult,
  NotificationRenderer,
  NotificationSink,
  SinkConfig,
  RendererName,
  SinkName,
} from "./types";

export {
  PlainTextRenderer,
  DiscordRenderer,
  SlackRenderer,
  MarkdownRenderer,
  getRenderer,
} from "./renderers";

export {
  WebhookSink,
  InAppSink,
  LogSink,
  getSink,
} from "./sinks";
