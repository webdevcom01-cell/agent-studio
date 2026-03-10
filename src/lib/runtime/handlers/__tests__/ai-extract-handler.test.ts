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

import { aiExtractHandler } from "../ai-extract-handler";

const FIELDS = [
  { name: "email", description: "User email address", type: "string" as const },
  { name: "age", description: "User age", type: "number" as const },
  { name: "subscribed", description: "Is subscribed", type: "boolean" as const },
];

function makeNode(overrides: Record<string, unknown> = {}): FlowNode {
  return {
    id: "ext-1",
    type: "ai_extract",
    position: { x: 0, y: 0 },
    data: { label: "Extract", fields: FIELDS, ...overrides },
  };
}

function makeContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: { nodes: [], edges: [], variables: [] },
    currentNodeId: "ext-1",
    variables: {},
    messageHistory: [
      { role: "user", content: "My email is john@example.com and I am 30 years old" },
    ],
    isNewConversation: false,
    ...overrides,
  };
}

beforeEach(() => { vi.clearAllMocks(); });

describe("aiExtractHandler", () => {
  it("returns early when fields are empty", async () => {
    const result = await aiExtractHandler(makeNode({ fields: [] }), makeContext());
    expect(mockGenerateText).not.toHaveBeenCalled();
    expect(result.nextNodeId).toBeNull();
  });

  it("returns early when conversation history is empty", async () => {
    const result = await aiExtractHandler(makeNode(), makeContext({ messageHistory: [] }));
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("extracts fields from AI JSON response", async () => {
    mockGenerateText.mockResolvedValue({
      text: '{"email": "john@example.com", "age": 30, "subscribed": true}',
    });
    const result = await aiExtractHandler(makeNode(), makeContext());
    expect(result.updatedVariables?.email).toBe("john@example.com");
    expect(result.updatedVariables?.age).toBe(30);
    expect(result.updatedVariables?.subscribed).toBe(true);
  });

  it("extracts JSON from markdown code block", async () => {
    mockGenerateText.mockResolvedValue({
      text: 'Here is the result:\n```json\n{"email": "test@test.com", "age": 25}\n```',
    });
    const result = await aiExtractHandler(makeNode(), makeContext());
    expect(result.updatedVariables?.email).toBe("test@test.com");
    expect(result.updatedVariables?.age).toBe(25);
  });

  it("ignores extra fields not in schema", async () => {
    mockGenerateText.mockResolvedValue({
      text: '{"email": "a@b.com", "age": 20, "extra_field": "ignored"}',
    });
    const result = await aiExtractHandler(makeNode(), makeContext());
    expect(result.updatedVariables?.email).toBe("a@b.com");
    expect(result.updatedVariables?.extra_field).toBeUndefined();
  });

  it("handles partial extraction (some fields missing)", async () => {
    mockGenerateText.mockResolvedValue({
      text: '{"email": "test@example.com"}',
    });
    const result = await aiExtractHandler(makeNode(), makeContext());
    expect(result.updatedVariables?.email).toBe("test@example.com");
    expect(result.updatedVariables?.age).toBeUndefined();
  });

  it("handles malformed JSON gracefully", async () => {
    mockGenerateText.mockResolvedValue({ text: "not json at all" });
    const result = await aiExtractHandler(makeNode(), makeContext());
    expect(result.updatedVariables).toEqual({});
  });

  it("handles AI error gracefully", async () => {
    mockGenerateText.mockRejectedValue(new Error("API error"));
    const result = await aiExtractHandler(makeNode(), makeContext());
    expect(result.nextNodeId).toBeNull();
    expect(result.messages).toHaveLength(0);
  });

  it("uses last 10 messages for context", async () => {
    const history = Array.from({ length: 15 }, (_, i) => ({
      role: "user" as const,
      content: `Message ${i}`,
    }));
    mockGenerateText.mockResolvedValue({ text: '{"email": "x@y.com"}' });

    await aiExtractHandler(makeNode(), makeContext({ messageHistory: history }));

    const callArgs = mockGenerateText.mock.calls[0][0];
    const prompt = callArgs.messages[0].content;
    expect(prompt).toContain("Message 5");
    expect(prompt).not.toContain("Message 4");
  });
});
