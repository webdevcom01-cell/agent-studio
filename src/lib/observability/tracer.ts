import { randomBytes } from "crypto";
import { logger } from "@/lib/logger";
import type {
  GenAISpanAttributes,
  SpanEvent,
  TraceContext,
  SpanKind,
} from "./types";

const OTEL_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "";
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME ?? "agent-studio";

function generateId(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

export function createTraceContext(parentSpanId?: string): TraceContext {
  return {
    traceId: generateId(16),
    spanId: generateId(8),
    parentSpanId,
  };
}

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
  }
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

      if (OTEL_ENDPOINT) {
        pushToOTLP(spanData).catch((err) => {
          logger.warn("Failed to push span to OTLP", { error: String(err) });
        });
      }

      logger.info("span", spanData);
    },
  };

  return span;
}

export function traceGenAI(
  name: string,
  attrs: GenAISpanAttributes,
  parentContext?: TraceContext
): Span {
  return startSpan(name, {
    kind: "client",
    parentContext,
    attributes: attrs as unknown as Record<string, string | number | boolean>,
  });
}

async function pushToOTLP(
  spanData: Record<string, unknown>
): Promise<void> {
  if (!OTEL_ENDPOINT) return;

  try {
    await fetch(`${OTEL_ENDPOINT}/v1/traces`, {
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
            scopeSpans: [
              {
                spans: [spanData],
              },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Fire-and-forget — never block the request
  }
}
