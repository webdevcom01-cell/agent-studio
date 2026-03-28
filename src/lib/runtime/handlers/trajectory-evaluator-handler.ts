import type { NodeHandler } from "../types";
import { scoreTrajectory, type TrajectoryStep } from "@/lib/evals/trajectory-scorer";

const DEFAULT_OUTPUT_VARIABLE = "trajectory_score";

interface Criterion {
  name: string;
  description: string;
  weight: number;
}

/**
 * trajectory_evaluator — Evaluates the entire execution path using
 * Amazon trajectory evaluation framework (step-by-step LLM scoring).
 */
export const trajectoryEvaluatorHandler: NodeHandler = async (node, context) => {
  const traceVariable = (node.data.executionTraceVariable as string) ?? "";
  const criteria = parseCriteria(node.data.criteria as unknown);
  const idealStepCount = (node.data.idealStepCount as number) ?? 0;
  const penalizeBacktracking = (node.data.penalizeBacktracking as boolean) ?? true;
  const penalizeRedundantCalls = (node.data.penalizeRedundantCalls as boolean) ?? true;
  const model = (node.data.model as string) || "deepseek-chat";
  const outputVariable =
    (node.data.outputVariable as string) || DEFAULT_OUTPUT_VARIABLE;

  const traceRaw = traceVariable
    ? context.variables[traceVariable]
    : undefined;

  const steps = parseSteps(traceRaw);

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
    const score = await scoreTrajectory({
      steps,
      criteria,
      idealStepCount,
      penalizeBacktracking,
      penalizeRedundantCalls,
      model,
    });

    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: score,
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
      typeof s === "object" &&
      s !== null &&
      typeof (s as Record<string, unknown>).nodeId === "string" &&
      typeof (s as Record<string, unknown>).nodeType === "string",
  ).map((s) => ({
    nodeId: s.nodeId,
    nodeType: s.nodeType,
    durationMs: typeof s.durationMs === "number" ? s.durationMs : 0,
  }));
}

function parseCriteria(raw: unknown): Criterion[] {
  if (!Array.isArray(raw)) return [{ name: "quality", description: "Overall step quality", weight: 1 }];
  return raw.filter(
    (c): c is Criterion =>
      typeof c === "object" &&
      c !== null &&
      typeof (c as Record<string, unknown>).name === "string",
  ).map((c) => ({
    name: c.name,
    description: c.description ?? "",
    weight: typeof c.weight === "number" ? c.weight : 1,
  }));
}
