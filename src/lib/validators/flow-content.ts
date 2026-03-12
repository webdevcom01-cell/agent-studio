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

export const flowContentSchema = z.object({
  nodes: z.array(flowNodeSchema).max(MAX_NODES),
  edges: z.array(flowEdgeSchema).max(MAX_EDGES),
  variables: z.array(flowVariableSchema).max(MAX_VARIABLES).default([]),
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

const EMPTY_FLOW: FlowContent = { nodes: [], edges: [], variables: [] };

export function parseFlowContent(json: unknown): FlowContent {
  const result = flowContentSchema.safeParse(json);
  if (result.success) return result.data as FlowContent;
  return EMPTY_FLOW;
}
