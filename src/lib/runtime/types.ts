import type { FlowContent, FlowNode } from "@/types";

export interface RuntimeContext {
  conversationId: string;
  agentId: string;
  flowContent: FlowContent;
  currentNodeId: string | null;
  variables: Record<string, unknown>;
  messageHistory: { role: "user" | "assistant" | "system"; content: string }[];
  isResuming?: boolean;
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
