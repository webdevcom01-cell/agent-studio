/**
 * SDLC Pipeline Orchestrator — P5
 *
 * Executes a PipelineRun step-by-step, wiring together:
 *   - Meta-Orchestrator  (task analysis + pipeline config)
 *   - ECC agent templates (per-step system prompts)
 *   - Vercel AI SDK      (generateText per step)
 *   - P3 Learn Hook      (fire-and-forget after each step)
 *   - BullMQ progress    (job.updateProgress between steps)
 *
 * Called by the BullMQ worker (processro is dynamic-imported).
 * Never called directly from API routes.
 *
 * Cancellation:
 *   The worker checks isPipelineCancelled() between every step.
 *   If true, execution stops and the run is left in CANCELLED state
 *   (the user already updated the DB via the cancel API route).
 *
 * Context accumulation:
 *   Each step receives:
 *     1. The original task description
 *     2. A "context document" built from all previous step outputs
 *   This lets later steps (e.g. code-reviewer) see what the planner produced.
 */

import { logger } from "@/lib/logger";

/** Infrastructure nodes that are not real agents — executed inline */
const INFRASTRUCTURE_NODES = new Set(["project_context", "sandbox_verify"]);

/** System prompts for infrastructure nodes */
const INFRA_PROMPTS: Record<string, string> = {
  project_context: "Gathering project context...",
  sandbox_verify: "Verifying sandbox environment...",
};

// ---------------------------------------------------------------------------
// Main entry point — called by the BullMQ worker
// ---------------------------------------------------------------------------

export interface OrchestratorInput {
  runId: string;
  agentId: string;
  userId?: string;
  taskDescription: string;
  pipeline: string[];
  modelId?: string;
}

export interface OrchestratorResult {
  finalOutput: string;
  stepCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  durationMs: number;
  cancelled?: boolean;
}

/**
 * Run a full SDLC pipeline.
 *
 * @param input           - Run configuration
 * @param onStepComplete  - Called after each step with (stepIndex, output)
 * @param isCancelled     - Async predicate checked between steps
 * @param onProgress      - Update BullMQ job progress (0–100)
 */
export async function runPipeline(
  input: OrchestratorInput,
  callbacks: {
    onStepComplete: (stepIndex: number, output: string) => Promise<void>;
    isCancelled: () => Promise<boolean>;
    onProgress: (pct: number) => Promise<void>;
  },
): Promise<OrchestratorResult> {
  const { runId, agentId, userId, taskDescription, pipeline, modelId } = input;
  const { onStepComplete, isCancelled, onProgress } = callbacks;

  const { getModel } = await import("@/lib/ai");
  const { generateText } = await import("ai");
  const { fireSdkLearnHook } = await import("@/lib/ecc/sdk-learn-hook");
  const { getAgentSystemPrompt } = await import("./agent-prompts");

  // Resolve model lazily — only needed if at least one AI step exists.
  // Using deepseek-chat as the default (always available, no extra API key).
  const resolvedModelId = modelId ?? "deepseek-chat";

  const startedAt = Date.now();

  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Context document — accumulated from previous step outputs
  const contextParts: string[] = [
    `# Task\n${taskDescription}`,
  ];

  const stepOutputs: string[] = [];

  for (let stepIdx = 0; stepIdx < pipeline.length; stepIdx++) {
    const stepId = pipeline[stepIdx];

    // Progress: 5% start → 90% max, spread evenly across steps
    const pct = Math.min(5 + Math.floor(((stepIdx) / pipeline.length) * 85), 90);
    await onProgress(pct);

    // Cancellation check before each step
    if (await isCancelled()) {
      logger.info("Pipeline cancelled before step", { runId, stepIdx, stepId });
      return {
        finalOutput: buildSummary(stepOutputs, pipeline),
        stepCount: stepIdx,
        totalInputTokens,
        totalOutputTokens,
        durationMs: Date.now() - startedAt,
        cancelled: true,
      };
    }

    logger.info("Pipeline step starting", { runId, stepIdx, stepId });

    let stepOutput: string;
    let stepInputTokens = 0;
    let stepOutputTokens = 0;
    const stepStart = Date.now();

    if (INFRASTRUCTURE_NODES.has(stepId)) {
      // Infrastructure nodes run inline — no AI call needed
      stepOutput = INFRA_PROMPTS[stepId] ?? `Infrastructure step: ${stepId}`;
    } else {
      // Agent step: load system prompt from ECC templates
      const model = getModel(resolvedModelId);
      const systemPrompt = getAgentSystemPrompt(stepId);
      const contextDoc = contextParts.join("\n\n---\n\n");

      const prompt = [
        contextDoc,
        `\n\n---\n\n# Instructions for this step (${stepId})\n`,
        `Apply your expertise to the task above. Be specific, actionable, and thorough.`,
        `Reference and build upon any previous step outputs shown in the context above.`,
      ].join("\n");

      const result = await generateText({
        model,
        system: systemPrompt,
        prompt,
        maxOutputTokens: 4096,
      });

      stepOutput = result.text;
      stepInputTokens = result.usage.inputTokens ?? 0;
      stepOutputTokens = result.usage.outputTokens ?? 0;
      totalInputTokens += stepInputTokens;
      totalOutputTokens += stepOutputTokens;

      const stepDurationMs = Date.now() - stepStart;

      // Fire learn hook — non-blocking, never throws
      void fireSdkLearnHook({
        agentId,
        userId,
        task: `[${stepId}] ${taskDescription.slice(0, 500)}`,
        response: stepOutput.slice(0, 2000),
        modelId: resolvedModelId,
        durationMs: stepDurationMs,
        inputTokens: stepInputTokens,
        outputTokens: stepOutputTokens,
      });
    }

    // Accumulate context for subsequent steps
    contextParts.push(
      `# Step ${stepIdx + 1} output (${stepId})\n${stepOutput.slice(0, 3000)}`,
    );
    stepOutputs.push(stepOutput);

    // Persist the step result
    await onStepComplete(stepIdx, stepOutput);

    logger.info("Pipeline step completed", {
      runId,
      stepIdx,
      stepId,
      outputLength: stepOutput.length,
    });
  }

  // All steps done
  await onProgress(100);

  const finalOutput = buildSummary(stepOutputs, pipeline);

  return {
    finalOutput,
    stepCount: pipeline.length,
    totalInputTokens,
    totalOutputTokens,
    durationMs: Date.now() - startedAt,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSummary(outputs: string[], pipeline: string[]): string {
  if (outputs.length === 0) return "No steps completed.";

  const sections = outputs.map((out, i) => {
    const stepId = pipeline[i] ?? `step-${i}`;
    const snippet = out.length > 1500 ? `${out.slice(0, 1500)}\n…[truncated]` : out;
    return `## Step ${i + 1}: ${stepId}\n\n${snippet}`;
  });

  return `# Pipeline Execution Summary\n\n${sections.join("\n\n---\n\n")}`;
}
