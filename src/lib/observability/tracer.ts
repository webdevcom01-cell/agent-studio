/**
 * Distributed Tracing — gen_ai.* semantic conventions (AAIF 2026)
 *
 * Improvements over v1:
 *   - OTLP push with exponential backoff retry (3 attempts, jitter)
 *   - Batch queue: spans are buffered and flushed every 2 s or when batch ≥ 20
 *   - Never blocks the HTTP request — all OTLP operations are fire-and-forget
 *   - createTraceContext / startSpan / traceGenAI / traceAgentCall / childContext
 */

import { logger } from "@/lib/logger";
import type {
  AgentCallSpanAttributes,
  GenAISpanAttributes,
  SpanEvent,
  TraceContext,
  SpanKind,
} from "./types";

const OTEL_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "";
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME ?? "agent-studio";

// ── ID generation ─────────────────────────────────────────────────────────────

function generateId(bytes: number): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Trace context ─────────────────────────────────────────────────────────────

export function createTraceContext(parentSpanId?: string): TraceContext {
  return {
    traceId: generateId(16),
    spanId: generateId(8),
    parentSpanId,
  };
}

export function childContext(parent: TraceContext): TraceContext {
  return {
    traceId: parent.traceId,
    spanId: generateId(8),
    parentSpanId: parent.spanId,
  };
}

// ── Span interface ────────────────────────────────────────────────────────────

export interface Span {
  traceContext: TraceContext;
  name: string;
  kind: SpanKind;
  startTime: number;
  attributes: Record<string, string | number | boolean>;
  events: SpanEvent[];
  addEvent(event: SpanEvent): void;
  setAttributes(attrs: Record<string, string | number | boolean>): void;
  end(): void;
}

export function startSpan(
  name: string,
  options?: {
    kind?: SpanKind;
    parentContext?: TraceContext;
    attributes?: Record<string, string | number | boolean>;
  },
): Span {
  const traceContext = options?.parentContext
    ? {
        traceId: options.parentContext.traceId,
        spanId: generateId(8),
        parentSpanId: options.parentContext.spanId,
      }
    : createTraceContext();

  const span: Span = {
    traceContext,
    name,
    kind: options?.kind ?? "internal",
    startTime: Date.now(),
    attributes: { "service.name": SERVICE_NAME, ...options?.attributes },
    events: [],

    addEvent(event: SpanEvent): void {
      span.events.push({ ...event, timestamp: event.timestamp ?? Date.now() });
    },

    setAttributes(attrs: Record<string, string | number | boolean>): void {
      Object.assign(span.attributes, attrs);
    },

    end(): void {
      const durationMs = Date.now() - span.startTime;
      const spanData = {
        traceId: traceContext.traceId,
        spanId: traceContext.spanId,
        parentSpanId: traceContext.parentSpanId,
        name: span.name,
        kind: span.kind,
        durationMs,
        attributes: span.attributes,
        events: span.events,
      };

      logger.info("span", spanData);

      if (OTEL_ENDPOINT) {
        enqueueSpan(spanData);
      }
    },
  };

  return span;
}

export function traceGenAI(
  name: string,
  attrs: GenAISpanAttributes,
  parentContext?: TraceContext,
): Span {
  return startSpan(name, {
    kind: "client",
    parentContext,
    attributes: attrs as unknown as Record<string, string | number | boolean>,
  });
}

export function traceAgentCall(
  attrs: AgentCallSpanAttributes,
  parentContext?: TraceContext,
): Span {
  return startSpan("gen_ai.agent_call", {
    kind: "client",
    parentContext,
    attributes: attrs as unknown as Record<string, string | number | boolean>,
  });
}

// ── OTLP batch queue with retry ───────────────────────────────────────────────

type SpanData = Record<string, unknown>;

const BATCH_SIZE = 20;
const FLUSH_INTERVAL_MS = 2_000;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 200;

let spanQueue: SpanData[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function enqueueSpan(spanData: SpanData): void {
  spanQueue.push(spanData);

  if (spanQueue.length >= BATCH_SIZE) {
    flushNow();
    return;
  }

  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushNow();
    }, FLUSH_INTERVAL_MS);
  }
}

function flushNow(): void {
  if (spanQueue.length === 0) return;

  const batch = spanQueue.splice(0, BATCH_SIZE);
  pushBatchToOTLP(batch, 0).catch(() => {
    // Already logged inside pushBatchToOTLP
  });
}

async function pushBatchToOTLP(batch: SpanData[], attempt: number): Promise<void> {
  if (!OTEL_ENDPOINT || batch.length === 0) return;

  try {
    const res = await fetch(`${OTEL_ENDPOINT}/v1/traces`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resourceSpans: [
          {
            resource: {
              attributes: [
                { key: "service.name", value: { stringValue: SERVICE_NAME } },
              ],
            },
            scopeSpans: [{ spans: batch }],
          },
        ],
      }),
      signal: AbortSignal.timeout(5_000),
    });

    if (!res.ok) {
      throw new Error(`OTLP responded ${res.status}`);
    }
  } catch (err) {
    if (attempt < MAX_RETRIES - 1) {
      // Exponential backoff with ±25% jitter
      const base = RETRY_BASE_MS * Math.pow(2, attempt);
      const jitter = base * (0.75 + Math.random() * 0.5);
      const delay = Math.round(jitter);

      logger.warn("OTLP push failed — retrying", {
        attempt: attempt + 1,
        retryInMs: delay,
        error: String(err),
      });

      setTimeout(() => {
        pushBatchToOTLP(batch, attempt + 1).catch(() => {});
      }, delay);
    } else {
      logger.warn("OTLP push failed after max retries — spans dropped", {
        spanCount: batch.length,
        error: String(err),
      });
    }
  }
}

/** Force-flush remaining spans — call at process shutdown if needed */
export function flushSpans(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flushNow();
}
