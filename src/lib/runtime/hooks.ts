import { logger } from "@/lib/logger";
import type {
  FlowHookEventType,
  FlowHookPayload,
  FlowHookSink,
  FlowHookRegistryInterface,
  RuntimeContext,
} from "./types";
import type { FlowContent } from "@/types";

// ---------------------------------------------------------------------------
// WebhookHookSink — fire-and-forget POST to external URLs
// ---------------------------------------------------------------------------

const WEBHOOK_TIMEOUT_MS = 5_000;

export class WebhookHookSink implements FlowHookSink {
  private readonly urls: string[];

  constructor(urls: string[]) {
    this.urls = urls.filter((u) => u.length > 0);
  }

  send(payload: FlowHookPayload): void {
    const body = JSON.stringify(payload);
    for (const url of this.urls) {
      // Fire-and-forget — never await, never block engine
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hook-Event": payload.event,
        },
        body,
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      }).catch((err) => {
        logger.warn("Hook webhook delivery failed", {
          url,
          event: payload.event,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }
  }
}

// ---------------------------------------------------------------------------
// FlowHookRegistry — manages sinks and event filtering
// ---------------------------------------------------------------------------

export class FlowHookRegistry implements FlowHookRegistryInterface {
  private readonly sinks: FlowHookSink[] = [];
  private readonly allowedEvents: Set<FlowHookEventType> | null;

  /**
   * @param allowedEvents — if provided, only these events are emitted.
   *   null/undefined = all events pass through.
   */
  constructor(allowedEvents?: FlowHookEventType[]) {
    this.allowedEvents =
      allowedEvents && allowedEvents.length > 0
        ? new Set(allowedEvents)
        : null;
  }

  addSink(sink: FlowHookSink): void {
    this.sinks.push(sink);
  }

  emit(payload: FlowHookPayload): void {
    // Event filter: skip if caller asked for a subset and this event isn't in it
    if (this.allowedEvents && !this.allowedEvents.has(payload.event)) {
      return;
    }
    for (const sink of this.sinks) {
      try {
        sink.send(payload);
      } catch (err) {
        // Sinks must never crash the engine
        logger.warn("Hook sink threw unexpectedly", {
          event: payload.event,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Factory — build registry from FlowContent config
// ---------------------------------------------------------------------------

/**
 * Creates a FlowHookRegistry from the flow's hook configuration.
 * Returns null if no hooks are configured (zero overhead when unused).
 */
export function createHooksFromFlowContent(
  flowContent: FlowContent
): FlowHookRegistry | null {
  const urls = flowContent.hookWebhookUrls;
  if (!urls || urls.length === 0) return null;

  const registry = new FlowHookRegistry(
    flowContent.hookEvents as FlowHookEventType[] | undefined
  );
  registry.addSink(new WebhookHookSink(urls));
  return registry;
}

// ---------------------------------------------------------------------------
// Convenience emitter — safe to call even when hooks is undefined
// ---------------------------------------------------------------------------

/**
 * Emit a hook event from the engine. No-op when hooks are not configured.
 * Never throws — all errors are caught and logged.
 */
export function emitHook(
  context: RuntimeContext,
  event: FlowHookEventType,
  extra?: Partial<Omit<FlowHookPayload, "event" | "agentId" | "conversationId" | "timestamp">>
): void {
  if (!context.hooks) return;
  try {
    context.hooks.emit({
      event,
      agentId: context.agentId,
      conversationId: context.conversationId,
      timestamp: Date.now(),
      ...extra,
    });
  } catch (err) {
    logger.warn("emitHook failed", {
      event,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
