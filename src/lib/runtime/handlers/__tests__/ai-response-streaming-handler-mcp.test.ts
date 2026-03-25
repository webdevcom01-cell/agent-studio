import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RuntimeContext, StreamChunk, StreamWriter } from "../../types";
import type { FlowNode } from "@/types";

vi.mock("ai", () => ({
  streamText: vi.fn(),
  stepCountIs: vi.fn((n: number) => `stepCountIs(${n})`),
}));

vi.mock("@/lib/ai", () => ({
  getModel: vi.fn(() => "mock-model"),
  DEFAULT_MODEL: "deepseek-chat",
}));

const { mockGetMCPToolsForAgent } = vi.hoisted(() => ({
  mockGetMCPToolsForAgent: vi.fn(),
}));
vi.mock("@/lib/mcp/client", () => ({
  getMCPToolsForAgent: mockGetMCPToolsForAgent,
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { streamText } from "ai";
import { logger } from "@/lib/logger";
import { aiResponseStreamingHandler } from "../ai-response-streaming-handler";

const mockedStreamText = vi.mocked(streamText);

function createNode(data: Record<string, unknown>): FlowNode {
  return {
    id: "ai-1",
    type: "ai_response",
    position: { x: 0, y: 0 },
    data,
  };
}

function createContext(): RuntimeContext {
  return {
    agentId: "agent-1",
    conversationId: "conv-1",
    flowContent: { nodes: [], edges: [], variables: [] },
    variables: {},
    currentNodeId: "ai-1",
    messageHistory: [{ role: "user", content: "Hello" }],
    isNewConversation: false,
  };
}

function createMockWriter(): StreamWriter & { chunks: StreamChunk[] } {
  const chunks: StreamChunk[] = [];
  return {
    chunks,
    write(chunk: StreamChunk) {
      chunks.push(chunk);
    },
    close() {},
  };
}

function createMockTextStream(tokens: string[]): AsyncIterable<string> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const token of tokens) {
        yield token;
      }
    },
  };
}

describe("aiResponseStreamingHandler — MCP integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes MCP tools to streamText when agent has servers", async () => {
    const mockTools = {
      search: { description: "Search the web", execute: vi.fn() },
      translate: { description: "Translate text", execute: vi.fn() },
    };
    mockGetMCPToolsForAgent.mockResolvedValue(mockTools);
    mockedStreamText.mockReturnValue({
      textStream: createMockTextStream(["result"]),
    } as ReturnType<typeof streamText>);

    const node = createNode({ prompt: "Use tools" });
    const ctx = createContext();
    const writer = createMockWriter();

    await aiResponseStreamingHandler(node, ctx, writer);

    expect(mockGetMCPToolsForAgent).toHaveBeenCalledWith("agent-1");
    expect(mockedStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: mockTools,
        stopWhen: "stepCountIs(20)",
      })
    );
  });

  it("does not pass tools when agent has no MCP servers", async () => {
    mockGetMCPToolsForAgent.mockResolvedValue({});
    mockedStreamText.mockReturnValue({
      textStream: createMockTextStream(["response"]),
    } as ReturnType<typeof streamText>);

    const node = createNode({});
    const ctx = createContext();
    const writer = createMockWriter();

    await aiResponseStreamingHandler(node, ctx, writer);

    const callArgs = mockedStreamText.mock.calls[0][0];
    expect(callArgs).not.toHaveProperty("tools");
    expect(callArgs).not.toHaveProperty("stopWhen");
  });

  it("continues without tools when getMCPToolsForAgent throws", async () => {
    mockGetMCPToolsForAgent.mockRejectedValue(new Error("DB connection failed"));
    mockedStreamText.mockReturnValue({
      textStream: createMockTextStream(["fallback response"]),
    } as ReturnType<typeof streamText>);

    const node = createNode({});
    const ctx = createContext();
    const writer = createMockWriter();

    const result = await aiResponseStreamingHandler(node, ctx, writer);

    expect(logger.warn).toHaveBeenCalledWith(
      "MCP tools unavailable, continuing without tools",
      expect.objectContaining({ agentId: "agent-1" })
    );

    const callArgs = mockedStreamText.mock.calls[0][0];
    expect(callArgs).not.toHaveProperty("tools");

    expect(result.messages[0].content).toBe("fallback response");
  });

  it("sets maxSteps to 20 when tools are present", async () => {
    const mockTools = {
      calculator: { description: "Do math", execute: vi.fn() },
    };
    mockGetMCPToolsForAgent.mockResolvedValue(mockTools);
    mockedStreamText.mockReturnValue({
      textStream: createMockTextStream(["42"]),
    } as ReturnType<typeof streamText>);

    const node = createNode({});
    const ctx = createContext();
    const writer = createMockWriter();

    await aiResponseStreamingHandler(node, ctx, writer);

    const callArgs = mockedStreamText.mock.calls[0][0];
    expect(callArgs.stopWhen).toBe("stepCountIs(20)");
  });
});
