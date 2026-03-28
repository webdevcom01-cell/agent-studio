export interface FlowNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  label?: string;
}

export interface FlowVariable {
  name: string;
  type: "string" | "number" | "boolean" | "object";
  default: unknown;
}

export interface FlowContent {
  nodes: FlowNode[];
  edges: FlowEdge[];
  variables: FlowVariable[];
}

export type NodeType =
  | "message"
  | "button"
  | "capture"
  | "condition"
  | "set_variable"
  | "end"
  | "goto"
  | "wait"
  | "ai_response"
  | "ai_classify"
  | "ai_extract"
  | "ai_summarize"
  | "api_call"
  | "function"
  | "kb_search"
  | "webhook"
  | "mcp_tool"
  | "call_agent"
  | "human_approval"
  | "loop"
  | "parallel"
  | "memory_write"
  | "memory_read"
  | "evaluator"
  | "schedule_trigger"
  | "webhook_trigger"
  | "email_send"
  | "notification"
  | "format_transform"
  | "switch"
  | "web_fetch"
  | "browser_action"
  | "desktop_app"
  | "learn"
  | "python_code"
  | "structured_output"
  | "cache"
  | "embeddings"
  | "retry"
  | "ab_test"
  | "semantic_router"
  | "cost_monitor"
  | "aggregate";
