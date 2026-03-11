import type { NodeHandler, ExecutionResult, RuntimeContext, OutputMessage } from "../types";
import { getHandler } from "./index";
import { resolveTemplate } from "../template";
import { logger } from "@/lib/logger";
import type { FlowNode } from "@/types";

const MAX_LOOP_ITERATIONS = 100;
const LOOP_STATE_KEY = "__loop_state";

interface LoopConfig {
  /** Maximum number of iterations (1-100) */
  maxIterations: number;
  /** Variable to check for exit condition */
  conditionVariable?: string;
  /** Comparison operator */
  conditionOperator?: "equals" | "not_equals" | "contains" | "greater_than" | "less_than" | "is_truthy" | "is_falsy";
  /** Value to compare against */
  conditionValue?: string;
  /** Variable name to store current iteration index (0-based) */
  loopVariable?: string;
  /** Loop mode: 'count' = fixed iterations, 'condition' = until condition met, 'while' = while condition is true */
  mode: "count" | "condition" | "while";
}

interface LoopState {
  nodeId: string;
  iteration: number;
  maxIterations: number;
}

function getLoopStates(variables: Record<string, unknown>): LoopState[] {
  return (variables[LOOP_STATE_KEY] as LoopState[]) ?? [];
}

function evaluateLoopCondition(
  config: LoopConfig,
  variables: Record<string, unknown>
): boolean {
  if (!config.conditionVariable) return false;

  const rawValue = variables[config.conditionVariable];
  const varValue = rawValue != null ? String(rawValue) : "";
  const compareValue = config.conditionValue
    ? resolveTemplate(config.conditionValue, variables)
    : "";

  switch (config.conditionOperator) {
    case "equals":
      return varValue === compareValue;
    case "not_equals":
      return varValue !== compareValue;
    case "contains":
      return varValue.includes(compareValue);
    case "greater_than":
      return Number(rawValue) > Number(compareValue);
    case "less_than":
      return Number(rawValue) < Number(compareValue);
    case "is_truthy":
      return Boolean(rawValue) && rawValue !== "false" && rawValue !== "0";
    case "is_falsy":
      return !rawValue || rawValue === "false" || rawValue === "0";
    default:
      return false;
  }
}

export const loopHandler: NodeHandler = async (node, context) => {
  const config: LoopConfig = {
    mode: (node.data.mode as LoopConfig["mode"]) ?? "count",
    maxIterations: Math.min(
      Math.max(Number(node.data.maxIterations) || 10, 1),
      MAX_LOOP_ITERATIONS
    ),
    conditionVariable: node.data.conditionVariable as string | undefined,
    conditionOperator: node.data.conditionOperator as LoopConfig["conditionOperator"],
    conditionValue: node.data.conditionValue as string | undefined,
    loopVariable: (node.data.loopVariable as string) || "loop_index",
  };

  // Get or initialize loop state for this node
  const loopStates = getLoopStates(context.variables);
  let currentState = loopStates.find((s) => s.nodeId === node.id);

  if (!currentState) {
    // First time entering this loop — initialize
    currentState = {
      nodeId: node.id,
      iteration: 0,
      maxIterations: config.maxIterations,
    };
    loopStates.push(currentState);
  }

  // Safety: hard cap on iterations
  if (currentState.iteration >= config.maxIterations) {
    logger.info("Loop completed max iterations", {
      nodeId: node.id,
      agentId: context.agentId,
      iterations: currentState.iteration,
    });

    // Clean up loop state
    const updatedStates = loopStates.filter((s) => s.nodeId !== node.id);

    // Route to "done" exit (else handle or default edge)
    const doneEdge = context.flowContent.edges.find(
      (e) => e.source === node.id && e.sourceHandle === "done"
    );
    const defaultEdge = context.flowContent.edges.find(
      (e) => e.source === node.id && !e.sourceHandle
    );

    return {
      messages: [],
      nextNodeId: doneEdge?.target ?? defaultEdge?.target ?? null,
      waitForInput: false,
      updatedVariables: {
        [LOOP_STATE_KEY]: updatedStates,
        [config.loopVariable ?? "loop_index"]: currentState.iteration,
      },
    };
  }

  // Check exit condition based on mode
  let shouldExit = false;

  if (config.mode === "condition" && currentState.iteration > 0) {
    // "condition" mode: loop UNTIL condition is true
    shouldExit = evaluateLoopCondition(config, context.variables);
  } else if (config.mode === "while" && currentState.iteration > 0) {
    // "while" mode: loop WHILE condition is true (exit when false)
    shouldExit = !evaluateLoopCondition(config, context.variables);
  }

  if (shouldExit) {
    logger.info("Loop condition met, exiting", {
      nodeId: node.id,
      agentId: context.agentId,
      iteration: currentState.iteration,
    });

    const updatedStates = loopStates.filter((s) => s.nodeId !== node.id);

    const doneEdge = context.flowContent.edges.find(
      (e) => e.source === node.id && e.sourceHandle === "done"
    );
    const defaultEdge = context.flowContent.edges.find(
      (e) => e.source === node.id && !e.sourceHandle
    );

    return {
      messages: [],
      nextNodeId: doneEdge?.target ?? defaultEdge?.target ?? null,
      waitForInput: false,
      updatedVariables: {
        [LOOP_STATE_KEY]: updatedStates,
        [config.loopVariable ?? "loop_index"]: currentState.iteration,
      },
    };
  }

  // Continue looping — increment iteration and route to loop body
  currentState.iteration++;

  const loopBodyEdge = context.flowContent.edges.find(
    (e) => e.source === node.id && e.sourceHandle === "loop_body"
  );

  if (!loopBodyEdge) {
    // No loop body connected — exit immediately
    const updatedStates = loopStates.filter((s) => s.nodeId !== node.id);

    return {
      messages: [
        {
          role: "assistant",
          content: "Loop has no body connected. Skipping.",
        },
      ],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        [LOOP_STATE_KEY]: updatedStates,
      },
    };
  }

  return {
    messages: [],
    nextNodeId: loopBodyEdge.target,
    waitForInput: false,
    updatedVariables: {
      [LOOP_STATE_KEY]: loopStates,
      [config.loopVariable ?? "loop_index"]: currentState.iteration - 1,
    },
  };
};
