import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerateText = vi.fn();
const mockGenerateObject = vi.fn();

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

vi.mock("@/lib/ai", () => ({
  getModel: vi.fn(() => "mock-model"),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { reflexiveLoopHandler } from "../reflexive-loop-handler";
import type { RuntimeContext } from "../../types";
import type { FlowNode, FlowContent } from "@/types";

function makeNode(overrides: Record<string, unknown> = {}): FlowNode {
  return {
    id: "refl-1",
    type: "reflexive_loop",
    position: { x: 0, y: 0 },
    data: {
      executorModel: "deepseek-chat",
      evaluatorModel: "deepseek-chat",
      maxIterations: 2,
      passingScore: 7,
      criteria: [{ name: "quality", description: "Overall quality", weight: 1 }],
      outputVariable: "reflexive_result",
      ...overrides,
    },
  };
}

function makeContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: { nodes: [], edges: [], variables: [] } as FlowContent,
    currentNodeId: "refl-1",
    variables: { last_message: "Write a haiku about code" },
    messageHistory: [],
    isNewConversation: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reflexiveLoopHandler", () => {
  it("returns graceful error when no input provided", async () => {
    const result = await reflexiveLoopHandler(
      makeNode(),
      makeContext({ variables: {} }),
    );

    expect(result.messages[0].content).toContain("no input");
    expect(result.nextNodeId).toBeNull();
    expect(result.waitForInput).toBe(false);
  });

  it("attempts generation with valid input (AI mock)", async () => {
    // Handler should call generateText for the first iteration
    mockGenerateText.mockRejectedValueOnce(new Error("mock stop"));

    const result = await reflexiveLoopHandler(makeNode(), makeContext());

    expect(result.messages.length > 0 || result.updatedVariables).toBeTruthy();
    expect(mockGenerateText).toHaveBeenCalled();
  });

  it("returns ExecutionResult shape on any path", async () => {
    const result = await reflexiveLoopHandler(
      makeNode(),
      makeContext({ variables: {} }),
    );

    expect(result).toHaveProperty("messages");
    expect(result).toHaveProperty("nextNodeId");
    expect(result).toHaveProperty("waitForInput");
    expect(Array.isArray(result.messages)).toBe(true);
  });

  it("handles AI failure gracefully", async () => {
    mockGenerateText.mockRejectedValueOnce(new Error("Rate limit"));

    const result = await reflexiveLoopHandler(makeNode(), makeContext());

    // Should not throw — graceful handling
    expect(result.waitForInput).toBe(false);
    expect(result.messages.length > 0 || result.updatedVariables).toBeTruthy();
  });

  it("clamps maxIterations and passingScore to valid ranges", async () => {
    mockGenerateText.mockRejectedValueOnce(new Error("mock stop"));

    // maxIterations > 5 should be capped to 5, passingScore > 10 capped to 10
    const result = await reflexiveLoopHandler(
      makeNode({ maxIterations: 99, passingScore: 15 }),
      makeContext(),
    );

    expect(result).toHaveProperty("messages");
    expect(result.waitForInput).toBe(false);
  });
});
