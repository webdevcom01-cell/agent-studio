import type { FlowContent, FlowNode } from "@/types";

export interface RuntimeContext {
  conversationId: string;
  agentId: string;
  flowContent: FlowContent;
  currentNodeId: string | null;
  variables: Record<string, unknown>;
  messageHistory: { role: "user" | "assistant" | "system"; content: string }[];
  isResuming?: boolean;
  isNewConversation: boolean;
  userId?: string;
  // Debug mode — when true, engine emits debug_* events into the stream
  debugMode?: boolean;
  // OTEL traceId for cross-referencing in Grafana
  otelTraceId?: string;
  // Breakpoints — set of nodeIds where execution should pause
  breakpoints?: Set<string>;
  // Debug session ID used to coordinate pause/resume via Redis
  debugSessionId?: string;
  // AbortSignal from the stream — propagated to sub-agent calls for early cancellation
  abortSignal?: AbortSignal;
  // When false, disables smart context compaction before history truncation.
  // Defaults to true — the engine summarizes context before discarding old messages.
  enableSmartCompaction?: boolean;
}

export interface ExecutionResult {
  messages: OutputMessage[];
  nextNodeId: string | null;
  waitForInput: boolean;
  updatedVariables?: Record<string, unknown>;
}

export interface OutputMessage {
  role: "assistant" | "system";
  content: string;
  metadata?: Record<string, unknown>;
}

export type NodeHandler = (
  node: FlowNode,
  context: RuntimeContext
) => Promise<ExecutionResult>;

export type HandlerRegistry = Record<string, NodeHandler>;

// ---------------------------------------------------------------------------
// Debug types
// ---------------------------------------------------------------------------

export type NodeDebugStatus = "pending" | "running" | "success" | "error" | "skipped" | "waiting";

export interface NodeExecution {
  iteration: number;
  status: Exclude<NodeDebugStatus, "pending" | "running">;
  durationMs: number;
  input?: unknown;
  output?: unknown;
  variables?: Record<string, unknown>;
  error?: string;
  timestamp: number;
  toolCalls?: ToolCallTrace[];
}

export interface ToolCallTrace {
  toolName: string;
  status: "success" | "error";
  durationMs: number;
  input?: unknown;
  result?: unknown;
  error?: string;
}

export interface NodeDebugState {
  nodeId: string;
  nodeType: string;
  nodeName: string;
  executions: NodeExecution[];
  aggregateStatus: NodeDebugStatus;
  totalDurationMs: number;
}

export interface DebugFlowSummary {
  totalDurationMs: number;
  nodesExecuted: number;
  nodesFailed: number;
  executionPath: string[];
  otelTraceId?: string;
}

// ---------------------------------------------------------------------------
// Stream protocol — existing + debug variants
// ---------------------------------------------------------------------------

export type StreamChunk =
  // ── Chat chunks (existing) ───────────────────────────────────────────────
  | { type: "message"; role: "assistant" | "system"; content: string; metadata?: Record<string, unknown> }
  | { type: "stream_start" }
  | { type: "stream_delta"; content: string }
  | { type: "stream_end"; content: string }
  | { type: "done"; conversationId: string; waitForInput: boolean }
  | { type: "error"; content: string }
  | { type: "heartbeat" }
  // ── Debug chunks (only emitted when debug: true) ─────────────────────────
  | { type: "debug_node_start"; nodeId: string; nodeType: string; nodeName: string; iteration: number; timestamp: number; variables: Record<string, unknown> }
  | { type: "debug_node_end"; nodeId: string; status: Exclude<NodeDebugStatus, "pending" | "running">; durationMs: number; output?: unknown; error?: string }
  | { type: "debug_edge_taken"; sourceNodeId: string; targetNodeId: string; edgeLabel?: string }
  | { type: "debug_tool_start"; nodeId: string; toolName: string; input?: unknown; timestamp: number }
  | { type: "debug_tool_end"; nodeId: string; toolName: string; durationMs: number; status: "success" | "error"; result?: unknown; error?: string }
  | { type: "debug_branch_start"; nodeId: string; branchId: string; label?: string; timestamp: number }
  | { type: "debug_branch_end"; nodeId: string; branchId: string; status: "success" | "error"; durationMs: number }
  | { type: "debug_flow_summary"; totalDurationMs: number; nodesExecuted: number; nodesFailed: number; executionPath: string[]; otelTraceId?: string }
  // ── Breakpoint chunks (Phase 6) ──────────────────────────────────────────
  | { type: "debug_breakpoint_hit"; nodeId: string; nodeType: string; nodeName: string; variables: Record<string, unknown>; debugSessionId: string }
  | { type: "debug_resumed"; nodeId: string; action: "continue" | "step" }
  // ── Variable Watch (Phase 7) ──────────────────────────────────────────────
  | { type: "debug_variables_updated"; variables: Record<string, unknown> };

export interface StreamWriter {
  write(chunk: StreamChunk): void;
  close(): void;
}

// ---------------------------------------------------------------------------
// Debug helper — safe emit (only when debug mode is on)
// ---------------------------------------------------------------------------

/** Cap payload to 10KB to prevent stream bloat */
const MAX_DEBUG_PAYLOAD = 10_240;

function sanitizePayload(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  try {
    const str = JSON.stringify(value);
    if (str.length > MAX_DEBUG_PAYLOAD) {
      return { __truncated: true, preview: str.slice(0, 200) + "…" };
    }
    return value;
  } catch {
    return { __unserializable: true };
  }
}

/** Strip sensitive keys from variables snapshot */
const SENSITIVE_KEYS = /key|secret|token|password|credential|api_key/i;

export function sanitizeVariables(vars: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(vars)) {
    safe[k] = SENSITIVE_KEYS.test(k) ? "[redacted]" : sanitizePayload(v);
  }
  return safe;
}

export function debugEmit(
  writer: StreamWriter,
  context: RuntimeContext,
  chunk: StreamChunk
): void {
  if (!context.debugMode) return;
  writer.write(chunk);
}

export function debugEmitNodeStart(
  writer: StreamWriter,
  context: RuntimeContext,
  nodeId: string,
  nodeType: string,
  nodeName: string,
  iteration: number
): void {
  if (!context.debugMode) return;
  writer.write({
    type: "debug_node_start",
    nodeId,
    nodeType,
    nodeName,
    iteration,
    timestamp: Date.now(),
    variables: sanitizeVariables(context.variables),
  });
}

export function debugEmitNodeEnd(
  writer: StreamWriter,
  context: RuntimeContext,
  nodeId: string,
  status: Exclude<NodeDebugStatus, "pending" | "running">,
  durationMs: number,
  output?: unknown,
  error?: string
): void {
  if (!context.debugMode) return;
  writer.write({
    type: "debug_node_end",
    nodeId,
    status,
    durationMs,
    output: sanitizePayload(output),
    error,
  });
}

export function debugEmitEdge(
  writer: StreamWriter,
  context: RuntimeContext,
  sourceNodeId: string,
  targetNodeId: string,
  edgeLabel?: string
): void {
  if (!context.debugMode) return;
  writer.write({ type: "debug_edge_taken", sourceNodeId, targetNodeId, edgeLabel });
}
