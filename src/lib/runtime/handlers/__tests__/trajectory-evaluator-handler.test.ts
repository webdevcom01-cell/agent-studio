import { describe, it, expect, vi, beforeEach } from "vitest";

const mockScoreTrajectory = vi.fn();

vi.mock("@/lib/evals/trajectory-scorer", () => ({
  scoreTrajectory: (...args: unknown[]) => mockScoreTrajectory(...args),
}));

import { trajectoryEvaluatorHandler } from "../trajectory-evaluator-handler";
import type { RuntimeContext } from "../../types";
import type { FlowNode, FlowContent } from "@/types";

const SAMPLE_TRACE = [
  { nodeId: "n1", nodeType: "ai_response", durationMs: 500 },
  { nodeId: "n2", nodeType: "condition", durationMs: 10 },
  { nodeId: "n3", nodeType: "api_call", durationMs: 200 },
];

function makeNode(overrides: Record<string, unknown> = {}): FlowNode {
  return {
    id: "traj-1",
    type: "trajectory_evaluator",
    position: { x: 0, y: 0 },
    data: {
      executionTraceVariable: "trace",
      criteria: [{ name: "quality", description: "Overall quality", weight: 1 }],
      idealStepCount: 3,
      penalizeBacktracking: true,
      penalizeRedundantCalls: true,
      model: "deepseek-chat",
      outputVariable: "trajectory_score",
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
    variables: { trace: SAMPLE_TRACE },
    messageHistory: [],
    isNewConversation: true,
    ...overrides,
  };
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

  it("scores optimal path with high score", async () => {
    mockScoreTrajectory.mockResolvedValueOnce({
      overallScore: 0.95,
      stepScores: [
        { step: "n1", score: 0.9, reasoning: "Good" },
        { step: "n2", score: 1.0, reasoning: "Efficient" },
        { step: "n3", score: 0.95, reasoning: "Fast" },
      ],
      efficiency: 1.0,
      redundantSteps: 0,
      backtrackCount: 0,
    });

    const result = await trajectoryEvaluatorHandler(makeNode(), makeContext());
    const output = result.updatedVariables?.trajectory_score as Record<string, unknown>;
    expect(output.overallScore).toBeGreaterThanOrEqual(0.9);
    expect(output.backtrackCount).toBe(0);
  });

  it("penalizes backtracking in score", async () => {
    mockScoreTrajectory.mockResolvedValueOnce({
      overallScore: 0.7,
      stepScores: [],
      efficiency: 0.75,
      redundantSteps: 0,
      backtrackCount: 2,
    });

    const trace = [...SAMPLE_TRACE, { nodeId: "n1", nodeType: "ai_response", durationMs: 500 }];
    const result = await trajectoryEvaluatorHandler(
      makeNode(),
      makeContext({ variables: { trace } }),
    );
    const output = result.updatedVariables?.trajectory_score as Record<string, unknown>;
    expect(output.backtrackCount).toBe(2);
  });

  it("penalizes redundant API calls", async () => {
    mockScoreTrajectory.mockResolvedValueOnce({
      overallScore: 0.65,
      stepScores: [],
      efficiency: 0.6,
      redundantSteps: 3,
      backtrackCount: 0,
    });

    const result = await trajectoryEvaluatorHandler(makeNode(), makeContext());
    const output = result.updatedVariables?.trajectory_score as Record<string, unknown>;
    expect(output.redundantSteps).toBe(3);
  });

  it("passes custom criteria to scorer", async () => {
    mockScoreTrajectory.mockResolvedValueOnce({
      overallScore: 0.8,
      stepScores: [],
      efficiency: 1.0,
      redundantSteps: 0,
      backtrackCount: 0,
    });

    const criteria = [
      { name: "speed", description: "Fast execution", weight: 0.7 },
      { name: "accuracy", description: "Correct results", weight: 0.3 },
    ];

    await trajectoryEvaluatorHandler(
      makeNode({ criteria }),
      makeContext(),
    );

    expect(mockScoreTrajectory).toHaveBeenCalledWith(
      expect.objectContaining({ criteria }),
    );
  });

  it("handles scorer failure gracefully", async () => {
    mockScoreTrajectory.mockRejectedValueOnce(new Error("AI unavailable"));

    const result = await trajectoryEvaluatorHandler(makeNode(), makeContext());
    expect(result.updatedVariables?.trajectory_score).toContain("[Error:");
  });
});
