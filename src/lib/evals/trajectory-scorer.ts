import { generateObject } from "ai";
import { getModel } from "@/lib/ai";
import { z } from "zod";

export interface TrajectoryStep {
  nodeId: string;
  nodeType: string;
  durationMs: number;
}

export interface StepScore {
  step: string;
  score: number;
  reasoning: string;
}

export interface TrajectoryScore {
  overallScore: number;
  stepScores: StepScore[];
  efficiency: number;
  redundantSteps: number;
  backtrackCount: number;
}

interface Criterion {
  name: string;
  description: string;
  weight: number;
}

interface ScoringOptions {
  steps: TrajectoryStep[];
  criteria: Criterion[];
  idealStepCount: number;
  penalizeBacktracking: boolean;
  penalizeRedundantCalls: boolean;
  model: string;
}

const StepScoreSchema = z.object({
  score: z.number().min(0).max(1),
  reasoning: z.string(),
});

export async function scoreTrajectory(
  options: ScoringOptions,
): Promise<TrajectoryScore> {
  const { steps, criteria, idealStepCount, penalizeBacktracking, penalizeRedundantCalls, model } = options;

  if (steps.length === 0) {
    return {
      overallScore: 0,
      stepScores: [],
      efficiency: 0,
      redundantSteps: 0,
      backtrackCount: 0,
    };
  }

  const backtrackCount = countBacktracks(steps);
  const redundantSteps = countRedundant(steps);
  const efficiency = idealStepCount > 0
    ? Math.min(1, idealStepCount / steps.length)
    : 1;

  const stepScores: StepScore[] = [];

  for (const step of steps) {
    const criteriaText = criteria
      .map((c) => `- ${c.name} (weight ${c.weight}): ${c.description}`)
      .join("\n");

    try {
      const { object } = await generateObject({
        model: getModel(model),
        schema: StepScoreSchema,
        prompt: `Score this execution step on a scale of 0.0-1.0 based on these criteria:

${criteriaText}

Step: Node "${step.nodeId}" (type: ${step.nodeType}), took ${step.durationMs}ms.
Context: This is step ${stepScores.length + 1} of ${steps.length} in the trajectory.

Provide a score and brief reasoning.`,
      });

      stepScores.push({
        step: step.nodeId,
        score: object.score,
        reasoning: object.reasoning,
      });
    } catch {
      stepScores.push({
        step: step.nodeId,
        score: 0.5,
        reasoning: "Scoring unavailable",
      });
    }
  }

  let overallScore = weightedAverage(stepScores, criteria);
  overallScore *= efficiency;

  if (penalizeBacktracking && backtrackCount > 0) {
    overallScore *= Math.max(0.5, 1 - backtrackCount * 0.1);
  }

  if (penalizeRedundantCalls && redundantSteps > 0) {
    overallScore *= Math.max(0.5, 1 - redundantSteps * 0.05);
  }

  return {
    overallScore: Number(overallScore.toFixed(3)),
    stepScores,
    efficiency: Number(efficiency.toFixed(3)),
    redundantSteps,
    backtrackCount,
  };
}

function countBacktracks(steps: TrajectoryStep[]): number {
  let count = 0;
  const visited = new Set<string>();

  for (const step of steps) {
    if (visited.has(step.nodeId)) count++;
    visited.add(step.nodeId);
  }

  return count;
}

function countRedundant(steps: TrajectoryStep[]): number {
  const apiTypes = new Set(["api_call", "web_fetch", "web_search", "mcp_tool"]);
  const seen = new Map<string, number>();
  let redundant = 0;

  for (const step of steps) {
    if (!apiTypes.has(step.nodeType)) continue;
    const count = (seen.get(step.nodeId) ?? 0) + 1;
    seen.set(step.nodeId, count);
    if (count > 1) redundant++;
  }

  return redundant;
}

function weightedAverage(
  scores: StepScore[],
  criteria: Criterion[],
): number {
  if (scores.length === 0) return 0;

  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
  if (totalWeight === 0) {
    return scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
  }

  const avgScore = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
  return avgScore;
}
