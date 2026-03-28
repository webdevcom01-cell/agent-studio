import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
import { logger } from "@/lib/logger";

interface SubTask {
  id: string;
  description: string;
  complexity: "simple" | "moderate" | "complex";
  dependencies: string[];
}

interface ExecutionPlan {
  goal: string;
  subtasks: SubTask[];
  executionStrategy: "sequential" | "parallel" | "dependency_graph";
  reasoning: string;
}

interface SubTaskResult {
  id: string;
  description: string;
  complexity: "simple" | "moderate" | "complex";
  model: string;
  output: string;
  durationMs: number;
  success: boolean;
  error?: string;
}

const MAX_SUBTASKS = 12;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_PARALLEL = 5;

/**
 * plan_and_execute — A powerful model decomposes a task into sub-tasks,
 * then cheap models execute each sub-task based on complexity tier.
 *
 * Outputs: plan, subtask results, synthesized final answer.
 * Routes to "done" on success, "failed" on failure.
 */
export const planAndExecuteHandler: NodeHandler = async (node, context) => {
  const plannerModel = (node.data.plannerModel as string) || "deepseek-reasoner";
  const maxSubtasks = Math.min(
    MAX_SUBTASKS,
    Math.max(1, Number(node.data.maxSubtasks) || 8),
  );
  const executionStrategy =
    (node.data.executionStrategy as string) || "auto";
  const enableSynthesis = node.data.enableSynthesis !== false;
  const timeoutPerSubtask =
    Number(node.data.timeoutPerSubtask) || DEFAULT_TIMEOUT_MS;
  const parallelLimit = Math.min(
    MAX_PARALLEL,
    Math.max(1, Number(node.data.parallelLimit) || MAX_PARALLEL),
  );
  const outputVariable =
    (node.data.outputVariable as string) || "plan_result";

  // Resolve input from previous context or user input
  const inputVar = (node.data.inputVariable as string) || "";
  const userInput = inputVar.trim()
    ? resolveTemplate(`{{${inputVar}}}`, context.variables)
    : (context.variables.last_message as string) ||
      (context.variables.user_input as string) ||
      "";

  if (!userInput) {
    return {
      messages: [
        {
          role: "assistant",
          content: "Plan-and-Execute skipped: no input provided.",
        },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  try {
    const { getModel, getModelByTier } = await import("@/lib/ai");
    const { generateObject, generateText } = await import("ai");
    const { z } = await import("zod");

    // ── Step 1: Plan (powerful model) ──────────────────────────────────────
    const planStart = performance.now();

    const SubTaskSchema = z.object({
      id: z.string(),
      description: z.string(),
      complexity: z.enum(["simple", "moderate", "complex"]),
      dependencies: z.array(z.string()).default([]),
    });

    const PlanSchema = z.object({
      goal: z.string(),
      subtasks: z.array(SubTaskSchema).max(maxSubtasks),
      executionStrategy: z.enum(["sequential", "parallel", "dependency_graph"]),
      reasoning: z.string(),
    });

    const planResult = await generateObject({
      model: getModel(plannerModel),
      schema: PlanSchema,
      prompt: `You are a task planner. Decompose this task into sub-tasks.

TASK: ${userInput}

Rules:
- Maximum ${maxSubtasks} sub-tasks
- Mark each sub-task as "simple" (quick lookup/format), "moderate" (analysis/generation), or "complex" (deep reasoning/multi-step)
- List dependencies by sub-task ID (empty array if independent)
- Choose execution strategy: "sequential" if order matters, "parallel" if independent, "dependency_graph" if mixed
- Each sub-task should be self-contained and actionable`,
      temperature: 0.3,
    });

    const plan: ExecutionPlan = planResult.object;
    const planDurationMs = performance.now() - planStart;

    logger.info("Plan-and-Execute: plan created", {
      agentId: context.agentId,
      subtaskCount: plan.subtasks.length,
      strategy: plan.executionStrategy,
      planDurationMs: Math.round(planDurationMs),
    });

    // ── Step 2: Execute sub-tasks ──────────────────────────────────────────
    const strategy =
      executionStrategy === "auto"
        ? plan.executionStrategy
        : executionStrategy;

    // Check for adaptive tier override from cost monitor
    const tierOverride = context.variables.__model_tier_override as string | undefined;

    const results: SubTaskResult[] = [];

    async function executeSubTask(subtask: SubTask): Promise<SubTaskResult> {
      const start = performance.now();
      try {
        // Select model based on complexity tier (with cost monitor override)
        const effectiveTier = tierOverride
          ? (tierOverride as "fast" | "balanced" | "powerful")
          : subtask.complexity === "simple"
            ? "fast"
            : subtask.complexity === "moderate"
              ? "balanced"
              : "powerful";

        const model = getModelByTier(effectiveTier);

        const { text } = await generateText({
          model,
          prompt: `Complete this task concisely and accurately:\n\n${subtask.description}\n\nContext from parent goal: ${plan.goal}`,
          temperature: 0.4,
          maxOutputTokens: 2000,
          abortSignal: AbortSignal.timeout(timeoutPerSubtask),
        });

        return {
          id: subtask.id,
          description: subtask.description,
          complexity: subtask.complexity,
          model: effectiveTier,
          output: text,
          durationMs: Math.round(performance.now() - start),
          success: true,
        };
      } catch (error) {
        return {
          id: subtask.id,
          description: subtask.description,
          complexity: subtask.complexity,
          model: "error",
          output: "",
          durationMs: Math.round(performance.now() - start),
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }

    if (strategy === "parallel") {
      // Execute in parallel batches
      for (let i = 0; i < plan.subtasks.length; i += parallelLimit) {
        const batch = plan.subtasks.slice(i, i + parallelLimit);
        const batchResults = await Promise.allSettled(
          batch.map(executeSubTask),
        );
        for (const result of batchResults) {
          if (result.status === "fulfilled") {
            results.push(result.value);
          } else {
            results.push({
              id: `batch_error_${i}`,
              description: "Batch execution failed",
              complexity: "simple",
              model: "error",
              output: "",
              durationMs: 0,
              success: false,
              error: result.reason instanceof Error ? result.reason.message : "Unknown",
            });
          }
        }
      }
    } else {
      // Sequential execution (respects dependencies)
      for (const subtask of plan.subtasks) {
        const result = await executeSubTask(subtask);
        results.push(result);
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const totalDurationMs = results.reduce((sum, r) => sum + r.durationMs, 0);

    // ── Step 3: Synthesize (optional) ──────────────────────────────────────
    let finalOutput = "";

    if (enableSynthesis && successCount > 0) {
      const subtaskOutputs = results
        .filter((r) => r.success)
        .map((r) => `[${r.id}] ${r.description}:\n${r.output}`)
        .join("\n\n---\n\n");

      const { text: synthesis } = await generateText({
        model: getModel(plannerModel),
        prompt: `You planned and executed sub-tasks for this goal: "${plan.goal}"

Here are the sub-task results:

${subtaskOutputs}

Now synthesize a coherent, complete final answer that addresses the original goal. Be thorough but concise.`,
        temperature: 0.3,
        maxOutputTokens: 4000,
      });

      finalOutput = synthesis;
    } else {
      finalOutput = results
        .filter((r) => r.success)
        .map((r) => r.output)
        .join("\n\n");
    }

    const allSucceeded = successCount === plan.subtasks.length;

    return {
      messages: [
        {
          role: "assistant",
          content: finalOutput || "Plan executed but no results were produced.",
        },
      ],
      nextNodeId: allSucceeded ? "done" : "failed",
      waitForInput: false,
      updatedVariables: {
        [outputVariable]: {
          plan,
          results,
          finalOutput,
          stats: {
            totalSubtasks: plan.subtasks.length,
            succeeded: successCount,
            failed: plan.subtasks.length - successCount,
            planDurationMs: Math.round(planDurationMs),
            executionDurationMs: Math.round(totalDurationMs),
            strategy,
          },
        },
      },
    };
  } catch (error) {
    logger.error("Plan-and-Execute failed", error, {
      agentId: context.agentId,
    });

    return {
      messages: [
        {
          role: "assistant",
          content:
            "I encountered an error while planning. Let me try to help directly instead.",
        },
      ],
      nextNodeId: "failed",
      waitForInput: false,
      updatedVariables: {
        [outputVariable]: {
          error: error instanceof Error ? error.message : "Unknown error",
          success: false,
        },
      },
    };
  }
};
