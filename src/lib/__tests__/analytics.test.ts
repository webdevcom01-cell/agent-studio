import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    analyticsEvent: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import {
  trackChatResponse,
  trackKBSearch,
  trackToolCall,
  trackAgentCall,
  trackError,
  trackFlowExecution,
  estimateCost,
} from "../analytics";
import { prisma } from "@/lib/prisma";

const mockCreate = vi.mocked(prisma.analyticsEvent.create);

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockResolvedValue({
    id: "evt-1",
    type: "CHAT_RESPONSE",
    agentId: "agent-1",
    metadata: {},
    createdAt: new Date(),
  } as ReturnType<typeof prisma.analyticsEvent.create> extends Promise<infer T> ? T : never);
});

describe("estimateCost", () => {
  it("calculates cost for known models", () => {
    const cost = estimateCost("gpt-4o-mini", 1000, 500);
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(0.01);
  });

  it("returns 0 for unknown models", () => {
    expect(estimateCost("unknown-model", 1000, 500)).toBe(0);
  });
});

describe("trackChatResponse", () => {
  it("creates a CHAT_RESPONSE analytics event with new fields", async () => {
    await trackChatResponse({
      agentId: "agent-1",
      conversationId: "conv-1",
      timeToFirstTokenMs: 150,
      totalResponseTimeMs: 800,
      isNewConversation: true,
    });

    expect(mockCreate).toHaveBeenCalledOnce();
    const call = mockCreate.mock.calls[0][0];
    expect(call.data.type).toBe("CHAT_RESPONSE");
    expect(call.data.agentId).toBe("agent-1");
    expect(call.data.durationMs).toBe(800);
    expect(call.data.ttfbMs).toBe(150);
    expect(call.data.conversationId).toBe("conv-1");
    const metadata = call.data.metadata as Record<string, unknown>;
    expect(metadata.timeToFirstTokenMs).toBe(150);
    expect(metadata.totalResponseTimeMs).toBe(800);
    expect(metadata.isNewConversation).toBe(true);
  });

  it("includes model and token data when provided", async () => {
    await trackChatResponse({
      agentId: "agent-1",
      conversationId: "conv-1",
      timeToFirstTokenMs: 100,
      totalResponseTimeMs: 500,
      isNewConversation: false,
      model: "gpt-4o-mini",
      inputTokens: 200,
      outputTokens: 100,
      isStreaming: true,
    });

    const call = mockCreate.mock.calls[0][0];
    expect(call.data.model).toBe("gpt-4o-mini");
    expect(call.data.inputTokens).toBe(200);
    expect(call.data.outputTokens).toBe(100);
    expect(call.data.totalTokens).toBe(300);
    expect(call.data.costUsd).toBeGreaterThan(0);
    const metadata = call.data.metadata as Record<string, unknown>;
    expect(metadata.isStreaming).toBe(true);
  });

  it("handles errors gracefully without throwing", async () => {
    mockCreate.mockRejectedValueOnce(new Error("DB error"));
    await expect(
      trackChatResponse({
        agentId: "agent-1",
        conversationId: "conv-1",
        timeToFirstTokenMs: 100,
        totalResponseTimeMs: 500,
        isNewConversation: false,
      })
    ).resolves.toBeUndefined();
  });
});

describe("trackKBSearch", () => {
  it("creates a KB_SEARCH analytics event with results", async () => {
    await trackKBSearch({
      agentId: "agent-1",
      conversationId: "conv-1",
      query: "how to setup",
      resultCount: 3,
      topScore: 0.85,
    });

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        type: "KB_SEARCH",
        agentId: "agent-1",
        conversationId: "conv-1",
        metadata: {
          query: "how to setup",
          resultCount: 3,
          topScore: 0.85,
          conversationId: "conv-1",
        },
      },
    });
  });

  it("creates event with null topScore when no results", async () => {
    await trackKBSearch({
      agentId: "agent-1",
      conversationId: "conv-1",
      query: "unknown topic",
      resultCount: 0,
      topScore: null,
    });

    const call = mockCreate.mock.calls[0][0];
    const metadata = call.data.metadata as Record<string, unknown>;
    expect(metadata.resultCount).toBe(0);
    expect(metadata.topScore).toBeNull();
  });
});

describe("trackToolCall", () => {
  it("creates a TOOL_CALL event", async () => {
    await trackToolCall({
      agentId: "agent-1",
      toolName: "web_search",
      durationMs: 250,
      success: true,
    });

    expect(mockCreate).toHaveBeenCalledOnce();
    const call = mockCreate.mock.calls[0][0];
    expect(call.data.type).toBe("TOOL_CALL");
    expect(call.data.durationMs).toBe(250);
    const metadata = call.data.metadata as Record<string, unknown>;
    expect(metadata.toolName).toBe("web_search");
    expect(metadata.success).toBe(true);
  });
});

describe("trackAgentCall", () => {
  it("creates an AGENT_CALL event with cost", async () => {
    await trackAgentCall({
      agentId: "agent-1",
      calleeAgentId: "agent-2",
      durationMs: 1500,
      model: "gpt-4o-mini",
      inputTokens: 500,
      outputTokens: 200,
      success: true,
    });

    expect(mockCreate).toHaveBeenCalledOnce();
    const call = mockCreate.mock.calls[0][0];
    expect(call.data.type).toBe("AGENT_CALL");
    expect(call.data.totalTokens).toBe(700);
    expect(call.data.costUsd).toBeGreaterThan(0);
  });
});

describe("trackError", () => {
  it("creates an ERROR event", async () => {
    await trackError({
      agentId: "agent-1",
      errorType: "timeout",
      errorMessage: "Request timed out after 30s",
      model: "gpt-4o",
    });

    expect(mockCreate).toHaveBeenCalledOnce();
    const call = mockCreate.mock.calls[0][0];
    expect(call.data.type).toBe("ERROR");
    expect(call.data.model).toBe("gpt-4o");
    const metadata = call.data.metadata as Record<string, unknown>;
    expect(metadata.errorType).toBe("timeout");
  });
});

describe("trackFlowExecution", () => {
  it("creates a FLOW_EXECUTION event", async () => {
    await trackFlowExecution({
      agentId: "agent-1",
      durationMs: 3000,
      nodesExecuted: 5,
      success: true,
      model: "deepseek-chat",
      inputTokens: 1000,
      outputTokens: 500,
    });

    expect(mockCreate).toHaveBeenCalledOnce();
    const call = mockCreate.mock.calls[0][0];
    expect(call.data.type).toBe("FLOW_EXECUTION");
    expect(call.data.durationMs).toBe(3000);
    expect(call.data.totalTokens).toBe(1500);
    const metadata = call.data.metadata as Record<string, unknown>;
    expect(metadata.nodesExecuted).toBe(5);
    expect(metadata.success).toBe(true);
  });
});
