import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerateObject = vi.fn();
const mockGenerateText = vi.fn();

vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}));

vi.mock("@/lib/ai", () => ({
  getModel: vi.fn(() => "mock-model"),
  getModelByTier: vi.fn(() => "mock-model"),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { planAndExecuteHandler } from "../plan-and-execute-handler";
import type { RuntimeContext } from "../../types";
import type { FlowNode, FlowContent } from "@/types";

function makeNode(overrides: Record<string, unknown> = {}): FlowNode {
  return {
    id: "pae-1",
    type: "plan_and_execute",
    position: { x: 0, y: 0 },
    data: {
      plannerModel: "deepseek-reasoner",
      maxSubtasks: 3,
      outputVariable: "plan_result",
      ...overrides,
    },
  };
}

function makeContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: { nodes: [], edges: [], variables: [] } as FlowContent,
    currentNodeId: "pae-1",
    variables: { last_message: "Analyze the security of our API" },
    messageHistory: [],
    isNewConversation: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("planAndExecuteHandler", () => {
  it("returns graceful error when no input provided", async () => {
    const result = await planAndExecuteHandler(
      makeNode(),
      makeContext({ variables: {} }),
    );

    expect(result.messages[0].content).toContain("no input");
    expect(result.nextNodeId).toBeNull();
    expect(result.waitForInput).toBe(false);
  });

  it("attempts planning with valid input (AI mock)", async () => {
    // Even if AI call structure changes, handler should call generateObject for planning
    mockGenerateObject.mockRejectedValueOnce(new Error("mock stop"));

    const result = await planAndExecuteHandler(makeNode(), makeContext());

    // Handler caught the error gracefully
    expect(result.messages.length > 0 || result.updatedVariables).toBeTruthy();
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
  });

  it("returns ExecutionResult shape on any path", async () => {
    const result = await planAndExecuteHandler(
      makeNode(),
      makeContext({ variables: {} }),
    );

    expect(result).toHaveProperty("messages");
    expect(result).toHaveProperty("nextNodeId");
    expect(result).toHaveProperty("waitForInput");
    expect(Array.isArray(result.messages)).toBe(true);
  });

  it("handles AI failure gracefully", async () => {
    mockGenerateObject.mockRejectedValueOnce(new Error("API timeout"));

    const result = await planAndExecuteHandler(makeNode(), makeContext());

    expect(result.messages[0].content).toBeTruthy();
    // Should not throw — graceful error
    expect(result.waitForInput).toBe(false);
  });

  it("reads input from inputVariable when configured", async () => {
    mockGenerateObject.mockRejectedValueOnce(new Error("stop"));

    await planAndExecuteHandler(
      makeNode({ inputVariable: "task" }),
      makeContext({ variables: { task: "Review code" } }),
    );

    // Should have tried planning with "Review code"
    expect(mockGenerateObject).toHaveBeenCalled();
  });
});
