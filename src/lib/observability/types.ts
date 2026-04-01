/**
 * OpenTelemetry-compatible types for gen_ai.* semantic conventions.
 * AAIF 2026 standard — AI Agent Interoperability Framework.
 *
 * These types match the OTEL gen_ai.* spec so that when
 * @opentelemetry/api is installed, spans can be created directly.
 *
 * Task 3.3 — added AAIF 2026 required attributes:
 *   gen_ai.operation.name — e.g. "generate", "stream", "execute_tool_call", "agent_call"
 *   gen_ai.agent.id       — Agent DB id of the agent executing/being called
 *   gen_ai.agent.name     — Human-readable agent name
 */

export interface GenAISpanAttributes {
  "gen_ai.system": string;
  "gen_ai.request.model": string;
  /** AAIF 2026 — operation type: "generate" | "stream" | "execute_tool_call" | "agent_call" | "kb_search" */
  "gen_ai.operation.name"?: string;
  /** AAIF 2026 — agent DB id */
  "gen_ai.agent.id"?: string;
  /** AAIF 2026 — human-readable agent name */
  "gen_ai.agent.name"?: string;
  "gen_ai.usage.input_tokens"?: number;
  "gen_ai.usage.output_tokens"?: number;
  "gen_ai.response.finish_reason"?: string;
  "gen_ai.request.temperature"?: number;
  "gen_ai.request.max_tokens"?: number;
}

/**
 * Attributes specific to agent-to-agent call spans.
 * Used by traceAgentCall() in tracer.ts.
 */
export interface AgentCallSpanAttributes {
  /** AAIF 2026 required */
  "gen_ai.operation.name": "agent_call";
  "gen_ai.agent.id": string;
  "gen_ai.agent.name": string;
  /** Caller agent context */
  "gen_ai.caller.agent.id"?: string;
  "gen_ai.caller.agent.name"?: string;
  /** Execution details */
  "agent_call.depth": number;
  "agent_call.input_length": number;
  "agent_call.timeout_seconds": number;
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
