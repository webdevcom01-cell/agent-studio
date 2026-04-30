import type { NodeHandler } from "../types";
import { logger } from "@/lib/logger";

const DEFAULT_OUTPUT_VARIABLE = "trajectory_score";
const DEFAULT_PASSING_SCORE = 6.0;
const DEFAULT_MAX_STEPS = 10;

interface TrajectoryStep {
  thought?: string;
  action?: string;
  observation?: string;
  // Legacy format support (Sprint 6 original)
  nodeId?: string;
  nodeType?: string;
  durationMs?: number;
}

interface EvalOutput {
  coherenceScore: number;
  efficiencyScore: number;
  goalAttainmentScore: number;
  overallScore: number;
  passed: boolean;
  reasoning: string;
  stepCount: number;
  issues: string[];
}

/**
 * trajectory_evaluator — Evaluates agent execution trajectory.
 * Scores coherence (logical flow), efficiency (step count), and goal attainment.
 * Uses LLM-as-Judge for coherence and goal scoring.
 */
export const trajectoryEvaluatorHandler: NodeHandler = async (node, context) => {
  const trajectoryVariable = (node.data.trajectoryVariable as string)
    || (node.data.executionTraceVariable as string)
    || "";
  const goalDescription = (node.data.goalDescription as string) ?? "";
  const maxSteps = (node.data.maxSteps as number) ?? DEFAULT_MAX_STEPS;
  const outputVariable =
    (node.data.outputVariable as string) || DEFAULT_OUTPUT_VARIABLE;
  const evaluatorModel = (node.data.evaluatorModel as string)
    || (node.data.model as string)
    || "gpt-4.1-mini";
  const passingScore = (node.data.passingScore as number) ?? DEFAULT_PASSING_SCORE;
  const weightCoherence = (node.data.weightCoherence as number) ?? 0.3;
  const weightEfficiency = (node.data.weightEfficiency as number) ?? 0.3;
  const weightGoalAttainment = (node.data.weightGoalAttainment as number) ?? 0.4;

  const rawSteps = trajectoryVariable
    ? context.variables[trajectoryVariable]
    : undefined;

  const steps = parseSteps(rawSteps);

  if (steps.length === 0) {
    return {
      messages: [
        { role: "assistant", content: "Trajectory Evaluator: no execution trace provided." },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  try {
    const efficiencyScore = computeEfficiency(steps.length, maxSteps);
    const issues: string[] = [];

    if (steps.length > maxSteps) {
      issues.push(`Agent used ${steps.length} steps (max expected: ${maxSteps})`);
    }

    // Detect repeated actions
    const actionCounts = new Map<string, number>();
    for (const step of steps) {
      const key = step.action ?? step.nodeId ?? "";
      if (key) actionCounts.set(key, (actionCounts.get(key) ?? 0) + 1);
    }
    for (const [action, count] of actionCounts) {
      if (count > 2) {
        issues.push(`Repeated action "${action}" ${count} times`);
      }
    }

    let coherenceScore = 7;
    let goalAttainmentScore = 5;
    let reasoning = "";

    try {
      const llmResult = await evaluateWithLLM(steps, goalDescription, evaluatorModel);
      coherenceScore = llmResult.coherenceScore;
      goalAttainmentScore = llmResult.goalAttainmentScore;
      reasoning = llmResult.reasoning;

      if (llmResult.issues.length > 0) {
        issues.push(...llmResult.issues);
      }
    } catch (err) {
      logger.warn("Trajectory LLM evaluation failed, using heuristic scores", {
        agentId: context.agentId,
        error: err instanceof Error ? err.message : String(err),
      });
      reasoning = "LLM evaluation unavailable — using heuristic scores";
    }

    const overallScore =
      coherenceScore * weightCoherence +
      efficiencyScore * weightEfficiency +
      goalAttainmentScore * weightGoalAttainment;

    const rounded = Number(overallScore.toFixed(2));

    const output: EvalOutput = {
      coherenceScore,
      efficiencyScore,
      goalAttainmentScore,
      overallScore: rounded,
      passed: rounded >= passingScore,
      reasoning,
      stepCount: steps.length,
      issues,
    };

    logger.info("Trajectory evaluation complete", {
      agentId: context.agentId,
      overallScore: rounded,
      passed: output.passed,
      stepCount: steps.length,
    });

    const nextHandle = output.passed ? "passed" : "failed";

    return {
      messages: [],
      nextNodeId: nextHandle,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: output,
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: `[Error: ${errorMsg}]`,
      },
    };
  }
};

function parseSteps(raw: unknown): TrajectoryStep[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (s): s is TrajectoryStep =>
      typeof s === "object" && s !== null &&
      (typeof (s as Record<string, unknown>).thought === "string" ||
       typeof (s as Record<string, unknown>).action === "string" ||
       typeof (s as Record<string, unknown>).nodeId === "string"),
  );
}

function computeEfficiency(stepCount: number, maxSteps: number): number {
  if (maxSteps <= 0) return 10;
  if (stepCount <= maxSteps) {
    return 10;
  }
  // Linearly degrade: at 2x maxSteps → score 5, at 3x → score 0
  const ratio = stepCount / maxSteps;
  return Math.max(0, Math.round((10 - (ratio - 1) * 5) * 100) / 100);
}

async function evaluateWithLLM(
  steps: TrajectoryStep[],
  goalDescription: string,
  modelId: string,
): Promise<{
  coherenceScore: number;
  goalAttainmentScore: number;
  reasoning: string;
  issues: string[];
}> {
  const { generateObject } = await import("ai");
  const { getModel } = await import("@/lib/ai");
  const { z } = await import("zod");

  const stepsText = steps
    .map((s, i) => {
      if (s.thought || s.action || s.observation) {
        return `Step ${i + 1}:\n  Thought: ${s.thought ?? "n/a"}\n  Action: ${s.action ?? "n/a"}\n  Observation: ${s.observation ?? "n/a"}`;
      }
      return `Step ${i + 1}: ${s.nodeType ?? "unknown"} (${s.nodeId ?? "?"})`;
    })
    .join("\n\n");

  const { object } = await generateObject({
    model: getModel(modelId),
    schema: z.object({
      coherenceScore: z.number().min(0).max(10),
      goalAttainmentScore: z.number().min(0).max(10),
      reasoning: z.string(),
      issues: z.array(z.string()),
    }),
    prompt: `Evaluate this agent execution trajectory.

Goal: ${goalDescription || "Not specified"}

Steps:
${stepsText}

Score on two dimensions (0-10):
1. Coherence: Do the steps logically follow from each other?
2. Goal Attainment: Was the stated goal achieved by the final step?

Also list any specific issues (redundant steps, logical gaps, missed actions).`,
  });

  return object;
}
