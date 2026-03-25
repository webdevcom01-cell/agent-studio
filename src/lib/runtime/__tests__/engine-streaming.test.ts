import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RuntimeContext, StreamChunk } from "../types";
import type { NodeType } from "@/types";

vi.mock("../handlers", () => ({
  getHandler: vi.fn(),
}));

vi.mock("../context", () => ({
  saveContext: vi.fn(),
  saveMessages: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: {
      create: vi.fn(),
    },
  },
}));

vi.mock("../handlers/ai-response-streaming-handler", () => ({
  aiResponseStreamingHandler: vi.fn(),
}));

import { getHandler } from "../handlers";
import { saveContext, saveMessages } from "../context";
import { aiResponseStreamingHandler } from "../handlers/ai-response-streaming-handler";
import { executeFlowStreaming } from "../engine-streaming";
import { parseChunk } from "../stream-protocol";

const mockedGetHandler = vi.mocked(getHandler);
const mockedSaveContext = vi.mocked(saveContext);
const mockedSaveMessages = vi.mocked(saveMessages);
const mockedAiStreamingHandler = vi.mocked(aiResponseStreamingHandler);

function createContext(overrides?: Partial<RuntimeContext>): RuntimeContext {
  return {
    agentId: "agent-1",
    conversationId: "conv-1",
    flowContent: { nodes: [], edges: [], variables: [] },
    variables: {},
    currentNodeId: null,
    messageHistory: [],
    isNewConversation: false,
    ...overrides,
  };
}

async function collectChunks(
  stream: ReadableStream<Uint8Array>
): Promise<StreamChunk[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const chunks: StreamChunk[] = [];
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const chunk = parseChunk(line);
      if (chunk) chunks.push(chunk);
    }
  }

  if (buffer.trim()) {
    const chunk = parseChunk(buffer);
    if (chunk) chunks.push(chunk);
  }

  return chunks;
}

describe("executeFlowStreaming", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSaveContext.mockResolvedValue();
    mockedSaveMessages.mockResolvedValue();
  });

  it("streams done for empty flow", async () => {
    const ctx = createContext();
    const stream = executeFlowStreaming(ctx);
    const chunks = await collectChunks(stream);

    const messageChunks = chunks.filter((c) => c.type === "message");
    expect(messageChunks).toHaveLength(1);
    expect(
      messageChunks[0].type === "message" && messageChunks[0].content
    ).toContain("empty");

    const doneChunk = chunks.find((c) => c.type === "done");
    expect(doneChunk).toBeDefined();
  });

  it("streams non-AI node messages as message chunks", async () => {
    const ctx = createContext({
      flowContent: {
        nodes: [
          {
            id: "n1",
            type: "message",
            position: { x: 0, y: 0 },
            data: {},
          },
        ],
        edges: [],
        variables: [],
      },
    });

    mockedGetHandler.mockReturnValue(async () => ({
      messages: [{ role: "assistant" as const, content: "Hello!" }],
      nextNodeId: null,
      waitForInput: false,
    }));

    const stream = executeFlowStreaming(ctx);
    const chunks = await collectChunks(stream);

    const messageChunks = chunks.filter((c) => c.type === "message");
    expect(messageChunks).toHaveLength(1);
    expect(
      messageChunks[0].type === "message" && messageChunks[0].content
    ).toBe("Hello!");

    expect(chunks.some((c) => c.type === "done")).toBe(true);
  });

  it("delegates ai_response nodes to streaming handler", async () => {
    const ctx = createContext({
      flowContent: {
        nodes: [
          {
            id: "n1",
            type: "ai_response",
            position: { x: 0, y: 0 },
            data: {},
          },
        ],
        edges: [],
        variables: [],
      },
    });

    mockedAiStreamingHandler.mockImplementation(
      async (_node, _ctx, writer) => {
        writer.write({ type: "stream_start" });
        writer.write({ type: "stream_delta", content: "Hi" });
        writer.write({ type: "stream_end", content: "Hi" });
        return {
          messages: [{ role: "assistant" as const, content: "Hi" }],
          nextNodeId: null,
          waitForInput: false,
        };
      }
    );

    const stream = executeFlowStreaming(ctx);
    const chunks = await collectChunks(stream);

    expect(chunks.some((c) => c.type === "stream_start")).toBe(true);
    expect(chunks.some((c) => c.type === "stream_delta")).toBe(true);
    expect(chunks.some((c) => c.type === "stream_end")).toBe(true);
    expect(chunks.some((c) => c.type === "done")).toBe(true);

    expect(mockedAiStreamingHandler).toHaveBeenCalledOnce();
  });

  it("interleaves message nodes and ai_response nodes", async () => {
    const ctx = createContext({
      flowContent: {
        nodes: [
          {
            id: "n1",
            type: "message",
            position: { x: 0, y: 0 },
            data: {},
          },
          {
            id: "n2",
            type: "ai_response",
            position: { x: 0, y: 100 },
            data: {},
          },
        ],
        edges: [{ id: "e1", source: "n1", target: "n2" }],
        variables: [],
      },
    });

    mockedGetHandler.mockReturnValue(async () => ({
      messages: [{ role: "assistant" as const, content: "Intro" }],
      nextNodeId: null,
      waitForInput: false,
    }));

    mockedAiStreamingHandler.mockImplementation(
      async (_node, _ctx, writer) => {
        writer.write({ type: "stream_start" });
        writer.write({ type: "stream_delta", content: "AI says hi" });
        writer.write({ type: "stream_end", content: "AI says hi" });
        return {
          messages: [{ role: "assistant" as const, content: "AI says hi" }],
          nextNodeId: null,
          waitForInput: false,
        };
      }
    );

    const stream = executeFlowStreaming(ctx);
    const chunks = await collectChunks(stream);

    const types = chunks.map((c) => c.type);
    const msgIdx = types.indexOf("message");
    const streamStartIdx = types.indexOf("stream_start");
    expect(msgIdx).toBeLessThan(streamStartIdx);
  });

  it("saves context and messages after stream completes", async () => {
    const ctx = createContext({
      flowContent: {
        nodes: [
          {
            id: "n1",
            type: "message",
            position: { x: 0, y: 0 },
            data: {},
          },
        ],
        edges: [],
        variables: [],
      },
    });

    mockedGetHandler.mockReturnValue(async () => ({
      messages: [{ role: "assistant" as const, content: "Hi" }],
      nextNodeId: null,
      waitForInput: false,
    }));

    const stream = executeFlowStreaming(ctx);
    await collectChunks(stream);

    expect(mockedSaveMessages).toHaveBeenCalledOnce();
    expect(mockedSaveContext).toHaveBeenCalledOnce();
  });

  it("handles waitForInput correctly", async () => {
    const ctx = createContext({
      flowContent: {
        nodes: [
          {
            id: "n1",
            type: "capture",
            position: { x: 0, y: 0 },
            data: {},
          },
        ],
        edges: [],
        variables: [],
      },
    });

    mockedGetHandler.mockReturnValue(async () => ({
      messages: [{ role: "assistant" as const, content: "Your name?" }],
      nextNodeId: "n2",
      waitForInput: true,
    }));

    const stream = executeFlowStreaming(ctx);
    const chunks = await collectChunks(stream);

    const doneChunk = chunks.find((c) => c.type === "done");
    expect(doneChunk).toBeDefined();
    if (doneChunk?.type === "done") {
      expect(doneChunk.waitForInput).toBe(true);
    }
  });

  it("handles missing handler gracefully", async () => {
    const ctx = createContext({
      flowContent: {
        nodes: [
          {
            id: "n1",
            type: "message" as NodeType,
            position: { x: 0, y: 0 },
            data: {},
          },
        ],
        edges: [],
        variables: [],
      },
    });

    mockedGetHandler.mockReturnValue(null);

    const stream = executeFlowStreaming(ctx);
    const chunks = await collectChunks(stream);

    const messageChunks = chunks.filter((c) => c.type === "message");
    expect(
      messageChunks.some(
        (c) => c.type === "message" && c.content.includes("Unsupported")
      )
    ).toBe(true);
  });

  it("handles handler errors gracefully", async () => {
    const ctx = createContext({
      flowContent: {
        nodes: [
          {
            id: "n1",
            type: "message",
            position: { x: 0, y: 0 },
            data: {},
          },
        ],
        edges: [],
        variables: [],
      },
    });

    mockedGetHandler.mockReturnValue(async () => {
      throw new Error("handler failed");
    });

    const stream = executeFlowStreaming(ctx);
    const chunks = await collectChunks(stream);

    const messageChunks = chunks.filter((c) => c.type === "message");
    expect(
      messageChunks.some(
        (c) => c.type === "message" && c.content.includes("went wrong")
      )
    ).toBe(true);
  });
});
