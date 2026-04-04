import { z } from "zod";
import type { FlowContent } from "@/types";

const NODE_TYPES = [
  "message",
  "button",
  "capture",
  "condition",
  "set_variable",
  "end",
  "goto",
  "wait",
  "ai_response",
  "ai_classify",
  "ai_extract",
  "ai_summarize",
  "api_call",
  "function",
  "kb_search",
  "webhook",
  "mcp_tool",
  "call_agent",
  "human_approval",
  "loop",
  "parallel",
  "memory_write",
  "memory_read",
  "evaluator",
  "schedule_trigger",
  "email_send",
  "notification",
  "format_transform",
  "switch",
  "web_fetch",
  "browser_action",
  "desktop_app",
  "webhook_trigger",
  "learn",
  "python_code",
  "structured_output",
  "cache",
  "embeddings",
  "retry",
  "ab_test",
  "semantic_router",
  "cost_monitor",
  "aggregate",
  "web_search",
  "multimodal_input",
  "image_generation",
  "speech_audio",
  "database_query",
  "file_operations",
  "mcp_task_runner",
  "guardrails",
  "code_interpreter",
  "trajectory_evaluator",
  "plan_and_execute",
  "reflexive_loop",
] as const;

const VARIABLE_TYPES = ["string", "number", "boolean", "object"] as const;

const MAX_NODES = 500;
const MAX_EDGES = 2000;
const MAX_VARIABLES = 100;

const flowNodeSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.enum(NODE_TYPES),
  position: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
  }),
  data: z.record(z.unknown()),
});

const flowEdgeSchema = z.object({
  id: z.string().min(1).max(200),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().optional(),
  label: z.string().optional(),
});

const flowVariableSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(VARIABLE_TYPES),
  default: z.unknown(),
});

const HOOK_EVENT_TYPES = [
  "onFlowStart",
  "onFlowComplete",
  "onFlowError",
  "beforeNodeExecute",
  "afterNodeExecute",
  "beforeToolCall",
  "afterToolCall",
  "onPreCompact",
  "onPersistentCap",
] as const;

export const flowContentSchema = z.object({
  nodes: z.array(flowNodeSchema).max(MAX_NODES),
  edges: z.array(flowEdgeSchema).max(MAX_EDGES),
  variables: z.array(flowVariableSchema).max(MAX_VARIABLES).default([]),
  // Lifecycle hooks — optional, no DB migration needed (stored in Flow.content JSON)
  hookWebhookUrls: z.array(z.string().url()).max(10).optional(),
  hookEvents: z.array(z.enum(HOOK_EVENT_TYPES)).optional(),
});

export type ValidatedFlowContent = z.infer<typeof flowContentSchema>;

export function validateFlowContent(
  data: unknown
): { success: true; data: ValidatedFlowContent } | { success: false; error: string } {
  const result = flowContentSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const firstError = result.error.issues[0];
  const path = firstError.path.join(".");
  return {
    success: false,
    error: `Invalid flow content: ${path ? `${path}: ` : ""}${firstError.message}`,
  };
}

/**
 * Additional semantic validation beyond Zod schema — checks cross-node/edge constraints.
 * Returns array of human-readable warnings (non-blocking).
 */
export function validateFlowSemantics(content: ValidatedFlowContent): string[] {
  const warnings: string[] = [];

  for (const node of content.nodes) {
    if (node.type !== "parallel") continue;

    const branches = node.data.branches as
      | { branchId?: string; outputVariable?: string }[]
      | undefined;

    if (!Array.isArray(branches) || branches.length === 0) {
      warnings.push(
        `Node "${node.id}" (parallel): branches[] is empty — add branches in the property panel.`,
      );
      continue;
    }

    for (let i = 0; i < branches.length; i++) {
      const b = branches[i];
      if (!b.branchId || typeof b.branchId !== "string") {
        warnings.push(
          `Node "${node.id}" (parallel): branch[${i}] is missing branchId.`,
        );
      }
      if (!b.outputVariable || typeof b.outputVariable !== "string") {
        warnings.push(
          `Node "${node.id}" (parallel): branch[${i}] is missing outputVariable.`,
        );
      }
    }

    const branchIds = branches
      .map((b) => b.branchId)
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    const outgoingHandles = new Set(
      content.edges
        .filter((e) => e.source === node.id && e.sourceHandle)
        .map((e) => e.sourceHandle),
    );

    for (const bid of branchIds) {
      if (!outgoingHandles.has(bid)) {
        warnings.push(
          `Node "${node.id}" (parallel): branch "${bid}" has no matching outgoing edge (sourceHandle).`,
        );
      }
    }
  }

  return warnings;
}

const EMPTY_FLOW: FlowContent = { nodes: [], edges: [], variables: [] };

export function parseFlowContent(json: unknown): FlowContent {
  const result = flowContentSchema.safeParse(json);
  if (result.success) return result.data as FlowContent;
  return EMPTY_FLOW;
}
