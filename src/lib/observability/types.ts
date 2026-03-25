/**
 * OpenTelemetry-compatible types for gen_ai.* semantic conventions.
 * AAIF 2026 standard — AI Agent Interoperability Framework.
 *
 * These types match the OTEL gen_ai.* spec so that when
 * @opentelemetry/api is installed, spans can be created directly.
 */

export interface GenAISpanAttributes {
  "gen_ai.system": string;
  "gen_ai.request.model": string;
  "gen_ai.usage.input_tokens"?: number;
  "gen_ai.usage.output_tokens"?: number;
  "gen_ai.response.finish_reason"?: string;
  "gen_ai.request.temperature"?: number;
  "gen_ai.request.max_tokens"?: number;
}

export interface SpanEvent {
  name: string;
  attributes?: Record<string, string | number | boolean>;
  timestamp?: number;
}

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

export interface MetricRecord {
  name: string;
  value: number;
  unit: string;
  attributes: Record<string, string | number>;
  timestamp: number;
}

export type SpanKind = "internal" | "server" | "client" | "producer" | "consumer";
