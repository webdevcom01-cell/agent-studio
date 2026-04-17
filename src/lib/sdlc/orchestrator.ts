/**
 * SDLC Pipeline Orchestrator — P6
 *
 * Executes a PipelineRun step-by-step, wiring together:
 *   - Codebase RAG        (index /tmp/sdlc → inject relevant code per step)
 *   - Multi-step planning (discovery → architecture → implementation → review)
 *   - Feedback loop       (test failures → retry implementation up to 3×)
 *   - Meta-Orchestrator   (task analysis + pipeline config)
 *   - ECC agent templates (per-step system prompts)
 *   - Vercel AI SDK       (generateText per step)
 *   - P3 Learn Hook       (fire-and-forget after each step)
 *   - BullMQ progress     (job.updateProgress between steps)
 *
 * Phase classification:
 *   PLANNING_STEPS       — discovery, architect, tdd_guide  → produce architecturePlan
 *   IMPLEMENTATION_STEPS — codegen, developer, implementation → produce code; receive architecturePlan + RAG
 *   TEST_STEPS           — sandbox, run_tests, test_runner  → detect failures → trigger feedback loop
 *   REVIEW_STEPS         — code_reviewer, sec_reviewer      → full context
 *
 * Feedback loop:
 *   After a TEST_STEP output indicates failure, the orchestrator re-runs the
 *   most recent IMPLEMENTATION_STEP with the failure report injected.
 *   Max retries: MAX_RETRIES (3). Each retry also re-runs the TEST_STEP to
 *   verify the fix before continuing.
 */

import { logger } from "@/lib/logger";
import {
  indexCodebase,
  searchCodebase,
  buildCodeContext,
} from "./codebase-rag";
import {
  runFeedbackIteration,
  didTestsFail,
  MAX_RETRIES,
} from "./feedback-loop";
import { executeRealTests } from "./code-extractor";

/** Working directory where the SDLC pipeline writes files */
const SDLC_WORKSPACE = "/tmp/sdlc";

/** Steps that produce the architecture/plan document used by later steps */
const PLANNING_STEPS = new Set([
  "discovery", "architect", "architecture", "planner",
  "tdd_guide", "security_eng", "project_context",
]);

/** Steps that produce implementation code — receive architecturePlan + RAG context */
const IMPLEMENTATION_STEPS = new Set([
  "codegen", "developer", "implementation", "coder",
  "code_generator", "feature_developer",
]);

/** Steps whose output may indicate test failures — trigger feedback loop.
 *  NOTE: infrastructure nodes (sandbox_verify) are intentionally excluded —
 *  they run inline and return static strings that can never signal failures. */
const TEST_STEPS = new Set([
  "sandbox", "run_tests", "test_runner",
]);

/** Infrastructure nodes that are not real agents — executed inline */
const INFRASTRUCTURE_NODES = new Set(["project_context", "sandbox_verify"]);

/** System prompts for infrastructure nodes */
const INFRA_PROMPTS: Record<string, string> = {
  project_context: "Gathering project context and indexing existing codebase...",
  sandbox_verify: "Verifying sandbox environment...",
};

/** Per-step timeout for AI calls (5 minutes). Prevents hung pipelines. */
const STEP_TIMEOUT_MS = 5 * 60 * 1000;

/** Maximum total context document size in characters. */
const MAX_CONTEXT_CHARS = 24_000;

/** Per-step output slice when building context for subsequent steps. */
const CONTEXT_SLICE_PER_STEP = 3_000;

/** Max RAG results to inject per step */
const RAG_TOP_K = 5;

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
  /** Resume from this step index (0-based). Steps before this are skipped.
   *  Existing stepResults for skipped steps are loaded into context. */
  startFromStep?: number;
  /** Pre-loaded step results from a previous (interrupted) run.
   *  Keys are stringified step indices, values are the step outputs. */
  existingStepResults?: Record<string, string>;
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
  const {
    runId, agentId, userId, taskDescription, pipeline, modelId,
    startFromStep = 0,
    existingStepResults,
  } = input;
  const { onStepComplete, isCancelled, onProgress } = callbacks;

  const { getModel } = await import("@/lib/ai");
  const { generateText } = await import("ai");
  const { fireSdkLearnHook } = await import("@/lib/ecc/sdk-learn-hook");
  const { getAgentSystemPrompt } = await import("./agent-prompts");

  // Resolve model lazily — deepseek-chat is always available, no extra API key needed.
  const resolvedModelId = modelId ?? "deepseek-chat";

  const startedAt = Date.now();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Context document — accumulated from previous step outputs
  const contextParts: string[] = [`# Task\n${taskDescription}`];
  const stepOutputs: string[] = [];

  // ── Phase tracking ──────────────────────────────────────────────────────────
  // Accumulated architecture/design plan from all PLANNING_STEPS.
  // Injected verbatim into every IMPLEMENTATION_STEP prompt.
  let architecturePlan = "";

  // Most recent IMPLEMENTATION_STEP state — required for the feedback loop.
  let lastImplStepIdx = -1;
  let lastImplOutput = "";
  let lastImplSystemPrompt = "";
  let lastImplCodeContext = "";

  // ── RAG: index the workspace codebase ──────────────────────────────────────
  // Best-effort — if the workspace doesn't exist yet the pipeline still runs;
  // RAG context will simply be empty for this run.
  let codebaseReady = false;
  try {
    const { filesIndexed } = await indexCodebase(SDLC_WORKSPACE, agentId);
    codebaseReady = filesIndexed > 0;
    logger.info("Pipeline: codebase indexed for RAG", { runId, filesIndexed });
  } catch (err) {
    logger.warn("Pipeline: codebase indexing skipped — workspace absent or empty", {
      runId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── Resume support: pre-seed context from a previous interrupted run ────────
  if (startFromStep > 0 && existingStepResults) {
    for (let i = 0; i < startFromStep && i < pipeline.length; i++) {
      const prevOutput = existingStepResults[String(i)];
      if (prevOutput) {
        contextParts.push(
          `# Step ${i + 1} output (${pipeline[i]})\n${prevOutput.slice(0, CONTEXT_SLICE_PER_STEP)}`,
        );
        stepOutputs.push(prevOutput);

        // Restore phase state so IMPLEMENTATION_STEPS and feedback loop work
        // correctly when resuming mid-pipeline.
        if (PLANNING_STEPS.has(pipeline[i])) {
          architecturePlan += `\n\n## ${pipeline[i]}\n${prevOutput.slice(0, 2000)}`;
        }
        if (IMPLEMENTATION_STEPS.has(pipeline[i])) {
          lastImplStepIdx = i;
          lastImplOutput = prevOutput;
          lastImplSystemPrompt = getAgentSystemPrompt(pipeline[i]);
          lastImplCodeContext = ""; // RAG context unavailable for resumed steps
        }
      }
    }
    logger.info("Pipeline resuming from step", {
      runId,
      startFromStep,
      preloadedSteps: stepOutputs.length,
    });
  }

  // ── Main step loop ──────────────────────────────────────────────────────────
  for (let stepIdx = startFromStep; stepIdx < pipeline.length; stepIdx++) {
    const stepId = pipeline[stepIdx];

    // Progress: 5% start → 90% max, spread evenly across steps
    const pct = Math.min(5 + Math.floor((stepIdx / pipeline.length) * 85), 90);
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
      // ── Infrastructure node: no AI call ──────────────────────────────────
      stepOutput = INFRA_PROMPTS[stepId] ?? `Infrastructure step: ${stepId}`;

    } else {
      // ── Agent step ────────────────────────────────────────────────────────
      const model = getModel(resolvedModelId);
      const systemPrompt = getAgentSystemPrompt(stepId);

      // RAG: retrieve code relevant to this step
      let codeContext = "";
      if (codebaseReady) {
        try {
          // Use step role + task description as the search query for relevance.
          const ragQuery = `${stepId} ${taskDescription.slice(0, 200)}`;
          const ragResults = await searchCodebase(ragQuery, agentId, RAG_TOP_K);
          codeContext = buildCodeContext(ragResults);
        } catch (err) {
          logger.warn("Pipeline: RAG search failed for step", {
            runId, stepIdx, stepId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Prompt assembly — layered by phase
      const contextDoc = buildContextDoc(contextParts);
      const promptSections: string[] = [contextDoc];

      // IMPLEMENTATION_STEPS receive the full architecture plan so the AI
      // knows exactly what to build before writing a single line of code.
      if (IMPLEMENTATION_STEPS.has(stepId) && architecturePlan) {
        promptSections.push(
          `\n\n---\n\n# Architecture & Design Plan\n${architecturePlan.slice(0, 3000)}`,
        );
      }

      // All steps get RAG-injected code context when available.
      if (codeContext) {
        promptSections.push(`\n\n---\n\n${codeContext}`);
      }

      promptSections.push(
        `\n\n---\n\n# Instructions for this step (${stepId})`,
        `Apply your expertise to the task above. Be specific, actionable, and thorough.`,
        `Reference and build upon any previous step outputs shown in the context above.`,
      );

      const prompt = promptSections.join("\n");

      // Per-step timeout via AbortController
      const ac = new AbortController();
      const timeoutId = setTimeout(() => ac.abort(), STEP_TIMEOUT_MS);

      try {
        const result = await generateText({
          model,
          system: systemPrompt,
          prompt,
          maxOutputTokens: 4096,
          abortSignal: ac.signal,
        });

        stepOutput = result.text;
        stepInputTokens = result.usage.inputTokens ?? 0;
        stepOutputTokens = result.usage.outputTokens ?? 0;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          throw new Error(
            `Pipeline step ${stepIdx} (${stepId}) timed out after ${STEP_TIMEOUT_MS / 1000}s`,
          );
        }
        throw err;
      } finally {
        clearTimeout(timeoutId);
      }

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

      // ── Phase tracking ────────────────────────────────────────────────────
      if (PLANNING_STEPS.has(stepId)) {
        // Accumulate each planning step's output into a single architecture plan.
        // Each section is labelled so the implementation agent knows which
        // part of the plan came from which specialist.
        architecturePlan += `\n\n## ${stepId}\n${stepOutput.slice(0, 2000)}`;
        logger.info("Pipeline: planning step done — architecture plan updated", {
          runId, stepIdx, stepId, planLength: architecturePlan.length,
        });
      }

      if (IMPLEMENTATION_STEPS.has(stepId)) {
        // Snapshot this step so the feedback loop can re-run it with failure context.
        lastImplStepIdx = stepIdx;
        lastImplOutput = stepOutput;
        lastImplSystemPrompt = systemPrompt;
        lastImplCodeContext = codeContext;

        // ── Real execution: parse code blocks → write files → compile + test ─
        // This is the core upgrade: instead of relying on an AI to "simulate"
        // test results, we write the actual generated code to disk, run the
        // TypeScript compiler, and run Vitest. The real stdout/stderr is then
        // fed into the feedback loop so the AI fixes actual errors.
        try {
          const execResult = await executeRealTests(stepOutput, SDLC_WORKSPACE, agentId);

          if (execResult.filesWritten > 0) {
            const realFailed = !execResult.typecheckPassed || !execResult.testsPassed;

            logger.info("Pipeline: real execution after implementation step", {
              runId, stepIdx, stepId,
              filesWritten: execResult.filesWritten,
              typecheckPassed: execResult.typecheckPassed,
              testsPassed: execResult.testsPassed,
            });

            if (realFailed) {
              // ── Feedback loop on real failures ──────────────────────────────
              logger.info("Pipeline: real compile/test failures — entering feedback loop", {
                runId, stepIdx, stepId, maxRetries: MAX_RETRIES,
              });

              let currentImpl = stepOutput;
              let currentTestOutput = execResult.testOutput;

              for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                const feedbackResult = await runFeedbackIteration(
                  {
                    taskDescription,
                    architecturePlan,
                    previousImplementation: currentImpl,
                    testOutput: currentTestOutput,
                    codebaseContext: codeContext,
                    agentId,
                    modelId: resolvedModelId,
                    attempt,
                  },
                  systemPrompt,
                );

                if (!feedbackResult.success) {
                  logger.warn("Pipeline: real-exec feedback iteration failed", { runId, attempt });
                  break;
                }

                currentImpl = feedbackResult.revisedImplementation;

                // Re-run real tests against the revised implementation
                const reExec = await executeRealTests(currentImpl, SDLC_WORKSPACE, agentId);
                currentTestOutput = reExec.testOutput;
                totalInputTokens += 0; // AI tokens already counted inside runFeedbackIteration
                totalOutputTokens += 0;

                const nowPassing = reExec.typecheckPassed && reExec.testsPassed;
                logger.info("Pipeline: real-exec feedback attempt complete", {
                  runId, attempt, nowPassing,
                });

                if (nowPassing) {
                  // Update step output to the working implementation
                  stepOutput = currentImpl + `\n\n---\n\n## Verified by real execution (attempt ${attempt})\n${currentTestOutput}`;
                  lastImplOutput = currentImpl;
                  logger.info("Pipeline: real execution passing after feedback loop", { runId, attempt });
                  break;
                }

                if (attempt === MAX_RETRIES) {
                  // Append the failure report to the step output for human review
                  stepOutput = currentImpl + `\n\n---\n\n## Real Execution (${MAX_RETRIES} attempts, still failing)\n${currentTestOutput}`;
                  lastImplOutput = currentImpl;
                  logger.warn("Pipeline: real-exec max retries reached", { runId, maxRetries: MAX_RETRIES });
                }
              }
            } else {
              // Tests pass — annotate the step output with the verification proof
              stepOutput = stepOutput + `\n\n---\n\n## Real Execution — PASSED\n${execResult.testOutput}`;
              logger.info("Pipeline: real execution passed on first try", { runId, stepIdx });
            }
          }
        } catch (execErr) {
          // Real execution is best-effort — never block the pipeline
          logger.warn("Pipeline: real execution failed unexpectedly, continuing", {
            runId, stepIdx,
            error: execErr instanceof Error ? execErr.message : String(execErr),
          });
        }
      }

      // ── Feedback loop — triggered by TEST_STEPS ───────────────────────────
      if (TEST_STEPS.has(stepId) && didTestsFail(stepOutput) && lastImplStepIdx >= 0) {
        logger.info("Pipeline: test failures detected — entering feedback loop", {
          runId, stepIdx, stepId, maxRetries: MAX_RETRIES,
        });

        let currentImpl = lastImplOutput;
        let currentTestOutput = stepOutput;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          // ── Step A: AI produces a revised implementation ──────────────────
          const feedbackResult = await runFeedbackIteration(
            {
              taskDescription,
              architecturePlan,
              previousImplementation: currentImpl,
              testOutput: currentTestOutput,
              codebaseContext: lastImplCodeContext,
              agentId,
              modelId: resolvedModelId,
              attempt,
            },
            lastImplSystemPrompt,
          );

          if (!feedbackResult.success) {
            logger.warn("Pipeline: feedback iteration failed — stopping retry", {
              runId, attempt,
            });
            break;
          }

          currentImpl = feedbackResult.revisedImplementation;

          // Persist the revised implementation so the caller can show progress.
          stepOutputs[lastImplStepIdx] = currentImpl;
          lastImplOutput = currentImpl; // Keep in sync — subsequent TEST_STEPS must see the latest version
          await onStepComplete(lastImplStepIdx, currentImpl);

          // Update the context window so the re-run test step sees the fix.
          // contextParts index: 0 = task, 1 = step-0, 2 = step-1, …
          // so step N is at contextParts[N + 1].
          contextParts[lastImplStepIdx + 1] =
            `# Step ${lastImplStepIdx + 1} output (${pipeline[lastImplStepIdx]}) [revised-attempt-${attempt}]\n` +
            currentImpl.slice(0, CONTEXT_SLICE_PER_STEP);

          // ── Step B: Re-run the test step against the revised implementation ─
          const testSystemPrompt = getAgentSystemPrompt(stepId);
          const rerunContextDoc = buildContextDoc(contextParts);

          const rerunPrompt = [
            rerunContextDoc,
            `\n\n---\n\n# Revised Implementation (Feedback Attempt ${attempt})`,
            `The implementation has been revised based on the previous test failures.`,
            `Re-run the full test suite against the revised code below:\n`,
            `\`\`\`\n${currentImpl.slice(0, 4_000)}\n\`\`\``,
            `\n\n---\n\n# Instructions for this step (${stepId})`,
            `Run ALL tests again. Report pass/fail for every test case.`,
            `Be precise — if any test still fails, say so explicitly with the failure message.`,
          ].join("\n");

          const testModel = getModel(resolvedModelId);
          const testAC = new AbortController();
          const testTimeoutId = setTimeout(() => testAC.abort(), STEP_TIMEOUT_MS);

          try {
            const testResult = await generateText({
              model: testModel,
              system: testSystemPrompt,
              prompt: rerunPrompt,
              maxOutputTokens: 4096,
              abortSignal: testAC.signal,
            });

            currentTestOutput = testResult.text;
            totalInputTokens += testResult.usage.inputTokens ?? 0;
            totalOutputTokens += testResult.usage.outputTokens ?? 0;
          } catch (retestErr) {
            logger.warn("Pipeline: test re-run failed in feedback loop", {
              runId, attempt,
              error: retestErr instanceof Error ? retestErr.message : String(retestErr),
            });
            break;
          } finally {
            clearTimeout(testTimeoutId);
          }

          const nowPassing = !didTestsFail(currentTestOutput);
          logger.info("Pipeline: feedback attempt complete", {
            runId, attempt, nowPassing,
          });

          // Tests are green — replace the test step output and stop retrying.
          if (nowPassing) {
            stepOutput = currentTestOutput;
            logger.info("Pipeline: all tests passing after feedback loop", {
              runId, attempt,
            });
            break;
          }

          // Exhausted retries — continue with the best test output we have.
          if (attempt === MAX_RETRIES) {
            stepOutput = currentTestOutput;
            logger.warn("Pipeline: max retries reached — proceeding with last test output", {
              runId, maxRetries: MAX_RETRIES,
            });
          }
        }
      }
    }

    // ── Accumulate context for subsequent steps ─────────────────────────────
    contextParts.push(
      `# Step ${stepIdx + 1} output (${stepId})\n${stepOutput.slice(0, CONTEXT_SLICE_PER_STEP)}`,
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

/**
 * Build the context document from accumulated parts, respecting MAX_CONTEXT_CHARS.
 * When total size exceeds the cap, older step outputs are progressively trimmed
 * (keeping the task description at full length).
 */
function buildContextDoc(parts: string[]): string {
  const joined = parts.join("\n\n---\n\n");
  if (joined.length <= MAX_CONTEXT_CHARS) return joined;

  // Task description (parts[0]) is never trimmed. Trim step outputs from oldest.
  let remaining = MAX_CONTEXT_CHARS - parts[0].length - 20; // 20 for separators overhead

  // Walk backwards (most recent first) to prioritise recent context
  const stepParts = parts.slice(1);
  const allocated: string[] = new Array(stepParts.length);

  for (let i = stepParts.length - 1; i >= 0; i--) {
    if (remaining <= 0) {
      allocated[i] = stepParts[i].split("\n")[0] + "\n[context trimmed]";
    } else if (stepParts[i].length <= remaining) {
      allocated[i] = stepParts[i];
      remaining -= stepParts[i].length;
    } else {
      allocated[i] = stepParts[i].slice(0, remaining) + "\n…[trimmed]";
      remaining = 0;
    }
  }

  return [parts[0], ...allocated].join("\n\n---\n\n");
}

function buildSummary(outputs: string[], pipeline: string[]): string {
  if (outputs.length === 0) return "No steps completed.";

  const sections = outputs.map((out, i) => {
    const stepId = pipeline[i] ?? `step-${i}`;
    const snippet = out.length > 1500 ? `${out.slice(0, 1500)}\n…[truncated]` : out;
    return `## Step ${i + 1}: ${stepId}\n\n${snippet}`;
  });

  return `# Pipeline Execution Summary\n\n${sections.join("\n\n---\n\n")}`;
}
