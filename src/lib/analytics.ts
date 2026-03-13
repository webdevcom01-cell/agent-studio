import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// ─── Cost per 1M tokens (USD) ──────────────────────────────────────────────
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "deepseek-chat": { input: 0.14, output: 0.28 },
  "deepseek-reasoner": { input: 0.55, output: 2.19 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4.1": { input: 2.0, output: 8.0 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "o3-mini": { input: 1.1, output: 4.4 },
  "claude-3-5-haiku-latest": { input: 0.8, output: 4 },
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "claude-opus-4-20250514": { input: 15, output: 75 },
  "gemini-2.5-flash": { input: 0.15, output: 0.6 },
  "gemini-2.5-pro": { input: 1.25, output: 10 },
  "llama-3.3-70b-versatile": { input: 0.59, output: 0.79 },
  "compound-beta": { input: 0.59, output: 0.79 },
  "mistral-small-latest": { input: 0.1, output: 0.3 },
  "mistral-medium-latest": { input: 0.4, output: 2 },
  "mistral-large-latest": { input: 2, output: 6 },
};

export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const costs = MODEL_COSTS[model];
  if (!costs) return 0;
  return (
    (inputTokens / 1_000_000) * costs.input +
    (outputTokens / 1_000_000) * costs.output
  );
}

// ─── Event Interfaces ───────────────────────────────────────────────────────

interface ChatResponseEvent {
  agentId: string;
  conversationId: string;
  sessionId?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  timeToFirstTokenMs: number;
  totalResponseTimeMs: number;
  isNewConversation: boolean;
  isStreaming?: boolean;
}

interface KBSearchEvent {
  agentId: string;
  conversationId: string;
  query: string;
  resultCount: number;
  topScore: number | null;
}

interface ToolCallEvent {
  agentId: string;
  conversationId?: string;
  sessionId?: string;
  toolName: string;
  mcpServerId?: string;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
}

interface AgentCallEvent {
  agentId: string;
  calleeAgentId: string;
  conversationId?: string;
  sessionId?: string;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
  success: boolean;
  errorMessage?: string;
}

interface ErrorEvent {
  agentId: string;
  conversationId?: string;
  sessionId?: string;
  errorType: "timeout" | "model_error" | "rate_limit" | "validation" | "runtime" | "mcp_error";
  errorMessage: string;
  model?: string;
  nodeType?: string;
}

interface FlowExecutionEvent {
  agentId: string;
  conversationId?: string;
  sessionId?: string;
  durationMs: number;
  nodesExecuted: number;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  success: boolean;
}

// ─── Tracking Functions ─────────────────────────────────────────────────────

async function safeTrack(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    logger.error("Analytics tracking failed", { error: err });
  }
}

export async function trackChatResponse(event: ChatResponseEvent): Promise<void> {
  await safeTrack(async () => {
    const totalTokens =
      event.inputTokens && event.outputTokens
        ? event.inputTokens + event.outputTokens
        : undefined;
    const cost =
      event.model && event.inputTokens && event.outputTokens
        ? estimateCost(event.model, event.inputTokens, event.outputTokens)
        : undefined;

    await prisma.analyticsEvent.create({
      data: {
        type: "CHAT_RESPONSE",
        agentId: event.agentId,
        model: event.model,
        inputTokens: event.inputTokens,
        outputTokens: event.outputTokens,
        totalTokens,
        costUsd: cost,
        durationMs: Math.round(event.totalResponseTimeMs),
        ttfbMs: Math.round(event.timeToFirstTokenMs),
        sessionId: event.sessionId,
        conversationId: event.conversationId,
        metadata: {
          timeToFirstTokenMs: event.timeToFirstTokenMs,
          totalResponseTimeMs: event.totalResponseTimeMs,
          conversationId: event.conversationId,
          isNewConversation: event.isNewConversation,
          isStreaming: event.isStreaming ?? false,
        },
      },
    });
  });
}

export async function trackKBSearch(event: KBSearchEvent): Promise<void> {
  await safeTrack(async () => {
    await prisma.analyticsEvent.create({
      data: {
        type: "KB_SEARCH",
        agentId: event.agentId,
        conversationId: event.conversationId,
        metadata: {
          query: event.query,
          resultCount: event.resultCount,
          topScore: event.topScore,
          conversationId: event.conversationId,
        },
      },
    });
  });
}

export async function trackToolCall(event: ToolCallEvent): Promise<void> {
  await safeTrack(async () => {
    await prisma.analyticsEvent.create({
      data: {
        type: "TOOL_CALL",
        agentId: event.agentId,
        durationMs: event.durationMs,
        sessionId: event.sessionId,
        conversationId: event.conversationId,
        metadata: {
          toolName: event.toolName,
          mcpServerId: event.mcpServerId,
          success: event.success,
          errorMessage: event.errorMessage,
        },
      },
    });
  });
}

export async function trackAgentCall(event: AgentCallEvent): Promise<void> {
  await safeTrack(async () => {
    const totalTokens =
      event.inputTokens && event.outputTokens
        ? event.inputTokens + event.outputTokens
        : undefined;
    const cost =
      event.model && event.inputTokens && event.outputTokens
        ? estimateCost(event.model, event.inputTokens, event.outputTokens)
        : undefined;

    await prisma.analyticsEvent.create({
      data: {
        type: "AGENT_CALL",
        agentId: event.agentId,
        model: event.model,
        inputTokens: event.inputTokens,
        outputTokens: event.outputTokens,
        totalTokens,
        costUsd: cost,
        durationMs: event.durationMs,
        sessionId: event.sessionId,
        conversationId: event.conversationId,
        metadata: {
          calleeAgentId: event.calleeAgentId,
          success: event.success,
          errorMessage: event.errorMessage,
        },
      },
    });
  });
}

export async function trackError(event: ErrorEvent): Promise<void> {
  await safeTrack(async () => {
    await prisma.analyticsEvent.create({
      data: {
        type: "ERROR",
        agentId: event.agentId,
        model: event.model,
        sessionId: event.sessionId,
        conversationId: event.conversationId,
        metadata: {
          errorType: event.errorType,
          errorMessage: event.errorMessage,
          nodeType: event.nodeType,
        },
      },
    });
  });
}

export async function trackFlowExecution(event: FlowExecutionEvent): Promise<void> {
  await safeTrack(async () => {
    const totalTokens =
      event.inputTokens && event.outputTokens
        ? event.inputTokens + event.outputTokens
        : undefined;
    const cost =
      event.model && event.inputTokens && event.outputTokens
        ? estimateCost(event.model, event.inputTokens, event.outputTokens)
        : undefined;

    await prisma.analyticsEvent.create({
      data: {
        type: "FLOW_EXECUTION",
        agentId: event.agentId,
        model: event.model,
        inputTokens: event.inputTokens,
        outputTokens: event.outputTokens,
        totalTokens,
        costUsd: cost,
        durationMs: event.durationMs,
        sessionId: event.sessionId,
        conversationId: event.conversationId,
        metadata: {
          nodesExecuted: event.nodesExecuted,
          success: event.success,
        },
      },
    });
  });
}
