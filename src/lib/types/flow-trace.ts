/**
 * Local type bridge for FlowTrace Prisma model.
 *
 * These types mirror the schema added in Phase 5 of the Visual Flow Debugger.
 * They are used by API routes and the frontend until `prisma generate` runs
 * on Railway (after the schema is deployed with `db:push`).
 *
 * Once the generated client is regenerated, these can be replaced with the
 * official imports from @/generated/prisma.
 */

export type TraceStatus = "RUNNING" | "COMPLETED" | "FAILED";

export interface FlowTrace {
  id: string;
  agentId: string;
  conversationId: string | null;
  testInput: string | null;
  status: TraceStatus;
  totalDurationMs: number | null;
  nodesExecuted: number | null;
  nodesFailed: number | null;
  executionPath: string[];
  nodeTraces: Record<string, unknown>;
  edgeTraces: Record<string, unknown>;
  flowSummary: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FlowTraceCreateInput {
  agentId: string;
  conversationId?: string;
  testInput?: string;
  status?: TraceStatus;
  totalDurationMs?: number;
  nodesExecuted?: number;
  nodesFailed?: number;
  executionPath?: string[];
  nodeTraces: Record<string, unknown>;
  edgeTraces: Record<string, unknown>;
  flowSummary?: Record<string, unknown>;
}

export interface FlowTraceUpdateInput {
  status?: TraceStatus;
  totalDurationMs?: number;
  nodesExecuted?: number;
  nodesFailed?: number;
  executionPath?: string[];
  nodeTraces?: Record<string, unknown>;
  edgeTraces?: Record<string, unknown>;
  flowSummary?: Record<string, unknown>;
}

// Lightweight summary for list views (no full nodeTraces payload)
export interface FlowTraceSummary {
  id: string;
  agentId: string;
  testInput: string | null;
  status: TraceStatus;
  totalDurationMs: number | null;
  nodesExecuted: number | null;
  nodesFailed: number | null;
  createdAt: Date;
}
