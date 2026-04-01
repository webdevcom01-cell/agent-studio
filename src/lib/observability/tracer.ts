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

/**
 * Generate a random hex ID using Web Crypto API (available in Node.js 19+ and all browsers).
 * Uses globalThis.crypto exclusively — no node:crypto import to avoid webpack UnhandledSchemeError.
 * Node.js 20 (used in CI and Railway) always has globalThis.crypto available.
 */
function generateId(bytes: number): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
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

/**
 * Task 3.3 — AAIF 2026 multi-hop agent tracing.
 *
 * Creates a child span for a sub-agent call, propagating the parent traceId
 * so the full chain (Orchestrator → Agent A → Agent B) appears as a single
 * distributed trace in Grafana / OTLP backends.
 *
 * Usage in agent-tools.ts:
 *   const span = traceAgentCall(callAttrs, parentTraceContext);
 *   // … execute call …
 *   span.setAttributes({ "gen_ai.usage.output_tokens": outputTokens });
 *   span.end();
 */
export function traceAgentCall(
  attrs: AgentCallSpanAttributes,
  parentContext?: TraceContext
): Span {
  return startSpan("gen_ai.agent_call", {
    kind: "client",
    parentContext,
    attributes: attrs as unknown as Record<string, string | number | boolean>,
  });
}

/**
 * Task 3.3 — Derive a child TraceContext from an existing context.
 *
 * Use this to propagate a traceId into a sub-agent call so that nested
 * spans share the same root traceId.
 *
 *   const childCtx = childContext(parentCtx);
 *   // pass childCtx as parentContext to the sub-agent's RuntimeContext
 */
export function childContext(parent: TraceContext): TraceContext {
  return {
    traceId: parent.traceId,
    spanId: generateId(8),
    parentSpanId: parent.spanId,
  };
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
