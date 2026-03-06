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
  | "webhook";
