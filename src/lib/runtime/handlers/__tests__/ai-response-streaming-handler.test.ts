import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RuntimeContext, StreamChunk, StreamWriter } from "../../types";
import type { FlowNode } from "@/types";

vi.mock("ai", () => ({
  streamText: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({
  getModel: vi.fn(() => "mock-model"),
  DEFAULT_MODEL: "deepseek-chat",
}));

vi.mock("@/lib/mcp/client", () => ({
  getMCPToolsForAgent: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { streamText } from "ai";
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

describe("aiResponseStreamingHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("streams tokens and returns full text", async () => {
    const tokens = ["Hello", " world", "!"];
    mockedStreamText.mockReturnValue({
      textStream: createMockTextStream(tokens),
    } as ReturnType<typeof streamText>);

    const node = createNode({ prompt: "Be helpful" });
    const ctx = createContext();
    const writer = createMockWriter();

    const result = await aiResponseStreamingHandler(node, ctx, writer);

    expect(writer.chunks[0]).toEqual({ type: "stream_start" });
    expect(writer.chunks[1]).toEqual({ type: "stream_delta", content: "Hello" });
    expect(writer.chunks[2]).toEqual({ type: "stream_delta", content: " world" });
    expect(writer.chunks[3]).toEqual({ type: "stream_delta", content: "!" });
    expect(writer.chunks[4]).toEqual({
      type: "stream_end",
      content: "Hello world!",
    });

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content).toBe("Hello world!");
    expect(result.waitForInput).toBe(false);
  });

  it("sets outputVariable when configured", async () => {
    mockedStreamText.mockReturnValue({
      textStream: createMockTextStream(["response"]),
    } as ReturnType<typeof streamText>);

    const node = createNode({ outputVariable: "answer" });
    const ctx = createContext();
    const writer = createMockWriter();

    const result = await aiResponseStreamingHandler(node, ctx, writer);

    expect(result.updatedVariables).toEqual({ answer: "response" });
  });

  it("handles empty response with fallback text", async () => {
    mockedStreamText.mockReturnValue({
      textStream: createMockTextStream([]),
    } as ReturnType<typeof streamText>);

    const node = createNode({});
    const ctx = createContext();
    const writer = createMockWriter();

    const result = await aiResponseStreamingHandler(node, ctx, writer);

    expect(result.messages[0].content).toBe(
      "I couldn't generate a response."
    );
    expect(writer.chunks).toContainEqual({
      type: "stream_end",
      content: "I couldn't generate a response.",
    });
  });

  it("writes error chunk when streamText throws", async () => {
    mockedStreamText.mockImplementation(() => {
      throw new Error("API failure");
    });

    const node = createNode({});
    const ctx = createContext();
    const writer = createMockWriter();

    const result = await aiResponseStreamingHandler(node, ctx, writer);

    expect(writer.chunks).toContainEqual(
      expect.objectContaining({ type: "error" })
    );
    expect(result.messages[0].content).toContain("AI call failed");
    expect(result.messages[0].content).toContain("API failure");
  });

  it("writes error diagnostic to outputVariable when streamText throws", async () => {
    mockedStreamText.mockImplementation(() => {
      throw new Error("timeout");
    });

    const node = createNode({ outputVariable: "stream_result" });
    const ctx = createContext();
    const writer = createMockWriter();

    const result = await aiResponseStreamingHandler(node, ctx, writer);

    expect(result.updatedVariables?.stream_result).toMatch(/^\[AI_ERROR\]/);
    expect(result.updatedVariables?.stream_result).toContain("timeout");
  });

  it("surfaces API key hint on missing provider key", async () => {
    mockedStreamText.mockImplementation(() => {
      throw new Error("OPENAI_API_KEY not configured");
    });

    const node = createNode({ outputVariable: "stream_result" });
    const ctx = createContext();
    const writer = createMockWriter();

    const result = await aiResponseStreamingHandler(node, ctx, writer);

    expect(result.messages[0].content).toContain("OPENAI_API_KEY");
    expect(result.updatedVariables?.stream_result).toContain("OPENAI_API_KEY");
  });
});
