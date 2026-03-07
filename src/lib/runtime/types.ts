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

export type StreamChunk =
  | { type: "message"; role: "assistant" | "system"; content: string }
  | { type: "stream_start" }
  | { type: "stream_delta"; content: string }
  | { type: "stream_end"; content: string }
  | { type: "done"; conversationId: string; waitForInput: boolean }
  | { type: "error"; content: string };

export interface StreamWriter {
  write(chunk: StreamChunk): void;
  close(): void;
}
