import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FlowNode } from "@/types";
import type { RuntimeContext } from "../../types";

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const mockGenerateText = vi.fn();
vi.mock("ai", () => ({ generateText: (...args: unknown[]) => mockGenerateText(...args) }));

vi.mock("@/lib/ai", () => ({
  getModel: vi.fn().mockReturnValue("mock-model"),
  DEFAULT_MODEL: "deepseek-chat",
}));

import { aiSummarizeHandler } from "../ai-summarize-handler";

function makeNode(overrides: Record<string, unknown> = {}): FlowNode {
  return {
    id: "sum-1",
    type: "ai_summarize",
    position: { x: 0, y: 0 },
    data: { label: "Summarize", outputVariable: "summary", maxLength: 200, ...overrides },
  };
}

function makeContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: { nodes: [], edges: [], variables: [] },
    currentNodeId: "sum-1",
    variables: {},
    messageHistory: [
      { role: "user", content: "Tell me about AI" },
      { role: "assistant", content: "AI is a broad field of computer science." },
      { role: "user", content: "What are the applications?" },
      { role: "assistant", content: "AI is used in healthcare, finance, and transportation." },
    ],
    isNewConversation: false,
    ...overrides,
  };
}

beforeEach(() => { vi.clearAllMocks(); });

describe("aiSummarizeHandler", () => {
  it("returns empty summary when conversation history is empty", async () => {
    const result = await aiSummarizeHandler(makeNode(), makeContext({ messageHistory: [] }));
    expect(result.updatedVariables?.summary).toBe("");
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("summarizes conversation and stores in outputVariable", async () => {
    mockGenerateText.mockResolvedValue({ text: "  User asked about AI and its applications.  " });
    const result = await aiSummarizeHandler(makeNode(), makeContext());
    expect(result.updatedVariables?.summary).toBe("User asked about AI and its applications.");
    expect(result.messages).toHaveLength(0);
  });

  it("uses custom outputVariable name", async () => {
    mockGenerateText.mockResolvedValue({ text: "Summary text" });
    const result = await aiSummarizeHandler(
      makeNode({ outputVariable: "convo_summary" }),
      makeContext(),
    );
    expect(result.updatedVariables?.convo_summary).toBe("Summary text");
  });

  it("includes maxLength in prompt", async () => {
    mockGenerateText.mockResolvedValue({ text: "Short summary" });
    await aiSummarizeHandler(makeNode({ maxLength: 100 }), makeContext());
    const prompt = mockGenerateText.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain("100 characters");
  });

  it("sets maxOutputTokens based on maxLength", async () => {
    mockGenerateText.mockResolvedValue({ text: "Summary" });
    await aiSummarizeHandler(makeNode({ maxLength: 300 }), makeContext());
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({ maxOutputTokens: 150 }),
    );
  });

  it("handles AI error gracefully with empty summary", async () => {
    mockGenerateText.mockRejectedValue(new Error("API error"));
    const result = await aiSummarizeHandler(makeNode(), makeContext());
    expect(result.updatedVariables?.summary).toBe("");
    expect(result.messages).toHaveLength(0);
  });

  it("includes all conversation messages in prompt", async () => {
    mockGenerateText.mockResolvedValue({ text: "Summary" });
    await aiSummarizeHandler(makeNode(), makeContext());
    const prompt = mockGenerateText.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain("Tell me about AI");
    expect(prompt).toContain("healthcare, finance");
  });
});
