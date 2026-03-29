import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerateObject = vi.fn();

vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

vi.mock("@/lib/ai", () => ({
  getModel: vi.fn(() => "mock-model"),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { trajectoryEvaluatorHandler } from "../trajectory-evaluator-handler";
import type { RuntimeContext } from "../../types";
import type { FlowNode, FlowContent } from "@/types";

const THOUGHT_ACTION_STEPS = [
  { thought: "I need to search for the user", action: "search_db", observation: "Found user Alice" },
  { thought: "Now I should check permissions", action: "check_perms", observation: "User has admin role" },
  { thought: "Return the result", action: "respond", observation: "Sent response" },
];

const LEGACY_STEPS = [
  { nodeId: "n1", nodeType: "ai_response", durationMs: 500 },
  { nodeId: "n2", nodeType: "condition", durationMs: 10 },
];

function makeNode(overrides: Record<string, unknown> = {}): FlowNode {
  return {
    id: "traj-1",
    type: "trajectory_evaluator",
    position: { x: 0, y: 0 },
    data: {
      trajectoryVariable: "trace",
      goalDescription: "Find user and verify permissions",
      maxSteps: 10,
      outputVariable: "trajectory_score",
      evaluatorModel: "deepseek-chat",
      passingScore: 6.0,
      weightCoherence: 0.3,
      weightEfficiency: 0.3,
      weightGoalAttainment: 0.4,
      ...overrides,
    },
  };
}

function makeContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: { nodes: [], edges: [], variables: [] } as FlowContent,
    currentNodeId: "traj-1",
    variables: { trace: THOUGHT_ACTION_STEPS },
    messageHistory: [],
    isNewConversation: true,
    ...overrides,
  };
}

function mockLLMResult(overrides: Record<string, unknown> = {}) {
  mockGenerateObject.mockResolvedValueOnce({
    object: {
      coherenceScore: 8,
      goalAttainmentScore: 9,
      reasoning: "Steps are logical and goal achieved",
      issues: [],
      ...overrides,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("trajectoryEvaluatorHandler", () => {
  it("returns error when no trace provided", async () => {
    const result = await trajectoryEvaluatorHandler(
      makeNode(),
      makeContext({ variables: {} }),
    );
    expect(result.messages[0].content).toContain("no execution trace");
  });

  it("evaluates thought/action/observation steps", async () => {
    mockLLMResult();

    const result = await trajectoryEvaluatorHandler(makeNode(), makeContext());
    const output = result.updatedVariables?.trajectory_score as Record<string, unknown>;

    expect(output.coherenceScore).toBe(8);
    expect(output.goalAttainmentScore).toBe(9);
    expect(output.efficiencyScore).toBe(10); // 3 steps <= 10 max
    expect(output.stepCount).toBe(3);
  });

  it("computes weighted overall score", async () => {
    mockLLMResult({ coherenceScore: 8, goalAttainmentScore: 9 });

    const result = await trajectoryEvaluatorHandler(makeNode(), makeContext());
    const output = result.updatedVariables?.trajectory_score as Record<string, unknown>;

    // 8*0.3 + 10*0.3 + 9*0.4 = 2.4 + 3.0 + 3.6 = 9.0
    expect(output.overallScore).toBeCloseTo(9.0, 1);
    expect(output.passed).toBe(true);
  });

  it("marks as failed when below passingScore", async () => {
    mockLLMResult({ coherenceScore: 3, goalAttainmentScore: 2 });

    const result = await trajectoryEvaluatorHandler(
      makeNode({ passingScore: 7 }),
      makeContext(),
    );
    const output = result.updatedVariables?.trajectory_score as Record<string, unknown>;

    expect(output.passed).toBe(false);
    expect(result.nextNodeId).toBe("failed");
  });

  it("routes to passed handle when score meets threshold", async () => {
    mockLLMResult({ coherenceScore: 9, goalAttainmentScore: 9 });

    const result = await trajectoryEvaluatorHandler(makeNode(), makeContext());

    expect(result.nextNodeId).toBe("passed");
  });

  it("penalizes efficiency when steps exceed maxSteps", async () => {
    const manySteps = Array.from({ length: 15 }, (_, i) => ({
      thought: `Step ${i}`,
      action: `action_${i}`,
      observation: `Done ${i}`,
    }));

    mockLLMResult();

    const result = await trajectoryEvaluatorHandler(
      makeNode({ maxSteps: 10 }),
      makeContext({ variables: { trace: manySteps } }),
    );
    const output = result.updatedVariables?.trajectory_score as Record<string, unknown>;

    expect(output.efficiencyScore).toBeLessThan(10);
    expect(output.stepCount).toBe(15);
    expect((output.issues as string[]).some((i) => i.includes("15 steps"))).toBe(true);
  });

  it("detects repeated actions as issues", async () => {
    const stepsWithRepeats = [
      { thought: "search", action: "search_db", observation: "no results" },
      { thought: "try again", action: "search_db", observation: "no results" },
      { thought: "one more time", action: "search_db", observation: "found it" },
    ];

    mockLLMResult();

    const result = await trajectoryEvaluatorHandler(
      makeNode(),
      makeContext({ variables: { trace: stepsWithRepeats } }),
    );
    const output = result.updatedVariables?.trajectory_score as Record<string, unknown>;

    expect((output.issues as string[]).some((i) => i.includes("search_db"))).toBe(true);
  });

  it("supports legacy nodeId/nodeType step format", async () => {
    mockLLMResult();

    const result = await trajectoryEvaluatorHandler(
      makeNode(),
      makeContext({ variables: { trace: LEGACY_STEPS } }),
    );
    const output = result.updatedVariables?.trajectory_score as Record<string, unknown>;

    expect(output.stepCount).toBe(2);
  });

  it("falls back to heuristic when LLM fails", async () => {
    mockGenerateObject.mockRejectedValueOnce(new Error("API error"));

    const result = await trajectoryEvaluatorHandler(makeNode(), makeContext());
    const output = result.updatedVariables?.trajectory_score as Record<string, unknown>;

    expect(output.reasoning).toContain("heuristic");
    expect(output.coherenceScore).toBe(7); // default heuristic
  });

  it("respects custom weights", async () => {
    mockLLMResult({ coherenceScore: 10, goalAttainmentScore: 0 });

    const result = await trajectoryEvaluatorHandler(
      makeNode({
        weightCoherence: 0.9,
        weightEfficiency: 0.05,
        weightGoalAttainment: 0.05,
      }),
      makeContext(),
    );
    const output = result.updatedVariables?.trajectory_score as Record<string, unknown>;

    // Heavy coherence weight: 10*0.9 + 10*0.05 + 0*0.05 = 9.5
    expect(output.overallScore).toBeGreaterThanOrEqual(9);
  });

  it("handles empty goal description", async () => {
    mockLLMResult();

    const result = await trajectoryEvaluatorHandler(
      makeNode({ goalDescription: "" }),
      makeContext(),
    );
    const output = result.updatedVariables?.trajectory_score as Record<string, unknown>;

    expect(output.stepCount).toBe(3);
    expect(mockGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Not specified"),
      }),
    );
  });

  it("backward compat: reads executionTraceVariable when trajectoryVariable not set", async () => {
    mockLLMResult();

    const result = await trajectoryEvaluatorHandler(
      makeNode({ trajectoryVariable: undefined, executionTraceVariable: "trace" }),
      makeContext(),
    );
    const output = result.updatedVariables?.trajectory_score as Record<string, unknown>;

    expect(output.stepCount).toBe(3);
  });
});
