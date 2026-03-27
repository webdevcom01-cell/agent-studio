import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerateText = vi.hoisted(() => vi.fn());
const mockStepCountIs = vi.hoisted(() => vi.fn(() => "stepCountPredicate"));
const mockGetModel = vi.hoisted(() => vi.fn(() => "mock-model"));
const mockGetMCPToolsForAgent = vi.hoisted(() => vi.fn());
const MOCK_DEFAULT_MODEL = vi.hoisted(() => "deepseek-chat");

vi.mock("ai", () => ({
  generateText: mockGenerateText,
  stepCountIs: mockStepCountIs,
}));

vi.mock("@/lib/ai", () => ({
  getModel: mockGetModel,
  DEFAULT_MODEL: MOCK_DEFAULT_MODEL,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/mcp/client", () => ({
  getMCPToolsForAgent: mockGetMCPToolsForAgent,
}));

import { aiResponseHandler } from "../ai-response-handler";
import type { FlowNode } from "@/types";
import type { RuntimeContext } from "../../types";

function makeNode(data: Record<string, unknown> = {}): FlowNode {
  return {
    id: "n1",
    type: "ai_response",
    position: { x: 0, y: 0 },
    data: { prompt: "You are a helpful assistant.", ...data },
  };
}

function makeContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: { nodes: [], edges: [], variables: [] },
    currentNodeId: "n1",
    variables: {},
    messageHistory: [{ role: "user", content: "Hello" }],
    isNewConversation: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetMCPToolsForAgent.mockResolvedValue({});
});

describe("aiResponseHandler", () => {
  it("returns AI-generated text as assistant message", async () => {
    mockGenerateText.mockResolvedValue({ text: "Hello! How can I help?" });

    const result = await aiResponseHandler(makeNode(), makeContext());

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe("assistant");
    expect(result.messages[0].content).toBe("Hello! How can I help?");
    expect(result.nextNodeId).toBeNull();
    expect(result.waitForInput).toBe(false);
  });

  it("uses configured model and temperature", async () => {
    mockGenerateText.mockResolvedValue({ text: "response" });

    await aiResponseHandler(
      makeNode({ model: "gpt-4o", temperature: 0.3, maxTokens: 1000 }),
      makeContext()
    );

    expect(mockGetModel).toHaveBeenCalledWith("gpt-4o");
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.3,
        maxOutputTokens: 1000,
      })
    );
  });

  it("stores response in outputVariable when configured", async () => {
    mockGenerateText.mockResolvedValue({ text: "stored value" });

    const result = await aiResponseHandler(
      makeNode({ outputVariable: "ai_result" }),
      makeContext()
    );

    expect(result.updatedVariables).toEqual({ ai_result: "stored value" });
  });

  it("does not set updatedVariables when no outputVariable", async () => {
    mockGenerateText.mockResolvedValue({ text: "response" });

    const result = await aiResponseHandler(
      makeNode({ outputVariable: "" }),
      makeContext()
    );

    expect(result.updatedVariables).toBeUndefined();
  });

  it("returns fallback message when AI returns empty text", async () => {
    mockGenerateText.mockResolvedValue({ text: "" });

    const result = await aiResponseHandler(makeNode(), makeContext());

    expect(result.messages[0].content).toBe(
      "I couldn't generate a response."
    );
  });

  it("includes system prompt and message history in generateText call", async () => {
    mockGenerateText.mockResolvedValue({ text: "ok" });

    await aiResponseHandler(
      makeNode({ prompt: "Be concise." }),
      makeContext({
        messageHistory: [
          { role: "user", content: "Hi" },
          { role: "assistant", content: "Hello" },
          { role: "user", content: "How are you?" },
        ],
      })
    );

    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.messages[0]).toEqual({
      role: "system",
      content: "Be concise.",
    });
    expect(callArgs.messages).toHaveLength(4);
  });

  it("injects MCP tools when agent has linked MCP servers", async () => {
    const mockTools = { search: { execute: vi.fn() } };
    mockGetMCPToolsForAgent.mockResolvedValue(mockTools);
    mockGenerateText.mockResolvedValue({ text: "found it" });

    await aiResponseHandler(makeNode(), makeContext());

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: mockTools,
        stopWhen: "stepCountPredicate",
      })
    );
  });

  it("does not inject tools when MCP returns empty", async () => {
    mockGetMCPToolsForAgent.mockResolvedValue({});
    mockGenerateText.mockResolvedValue({ text: "no tools" });

    await aiResponseHandler(makeNode(), makeContext());

    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.tools).toBeUndefined();
    expect(callArgs.stopWhen).toBeUndefined();
  });

  it("continues without tools when MCP loading fails", async () => {
    mockGetMCPToolsForAgent.mockRejectedValue(new Error("MCP offline"));
    mockGenerateText.mockResolvedValue({ text: "no tools fallback" });

    const result = await aiResponseHandler(makeNode(), makeContext());

    expect(result.messages[0].content).toBe("no tools fallback");
    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.tools).toBeUndefined();
  });

  it("returns graceful error message on AI failure", async () => {
    mockGenerateText.mockRejectedValue(new Error("API rate limit exceeded"));

    const result = await aiResponseHandler(makeNode(), makeContext());

    expect(result.messages[0].role).toBe("assistant");
    expect(result.messages[0].content).toContain(
      "having trouble generating a response"
    );
    expect(result.nextNodeId).toBeNull();
    expect(result.waitForInput).toBe(false);
  });

  it("does not set updatedVariables on error", async () => {
    mockGenerateText.mockRejectedValue(new Error("timeout"));

    const result = await aiResponseHandler(
      makeNode({ outputVariable: "ai_result" }),
      makeContext()
    );

    expect(result.updatedVariables).toBeUndefined();
  });

  it("resolves template variables in prompt", async () => {
    mockGenerateText.mockResolvedValue({ text: "ok" });

    await aiResponseHandler(
      makeNode({ prompt: "Help {{userName}} with {{topic}}" }),
      makeContext({
        variables: { userName: "Alice", topic: "math" },
      })
    );

    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.messages[0].content).toBe("Help Alice with math");
  });

  it("uses default model when none specified", async () => {
    mockGenerateText.mockResolvedValue({ text: "ok" });

    await aiResponseHandler(
      makeNode({ model: undefined }),
      makeContext()
    );

    expect(mockGetModel).toHaveBeenCalledWith(MOCK_DEFAULT_MODEL);
  });
});
