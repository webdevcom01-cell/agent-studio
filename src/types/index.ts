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
  /** Webhook URLs to receive lifecycle hook events (fire-and-forget POST) */
  hookWebhookUrls?: string[];
  /** Which hook events to emit — empty/undefined = all events */
  hookEvents?: string[];
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
  | "aggregate"
  | "web_search"
  | "multimodal_input"
  | "image_generation"
  | "speech_audio"
  | "database_query"
  | "file_operations"
  | "mcp_task_runner"
  | "guardrails"
  | "code_interpreter"
  | "trajectory_evaluator"
  | "plan_and_execute"
  | "reflexive_loop"
  | "swarm"
  | "verification"
  | "ast_transform"
  | "lsp_query";
