/**
 * feedback-loop.ts
 *
 * Test-failure feedback loop for the SDLC pipeline.
 *
 * When the process-runner step (test execution) reports failures,
 * this module:
 *   1. Parses the test output to extract failures
 *   2. Builds a structured failure report
 *   3. Re-runs the implementation step with failure context
 *   4. Repeats up to MAX_RETRIES times
 *
 * The loop is integrated into the orchestrator — it intercepts
 * after the "run_tests" step and before "git_commit".
 *
 * Usage:
 *   const result = await runFeedbackLoop({
 *     taskDescription,
 *     implementationOutput,
 *     testOutput,
 *     agentId,
 *     modelId,
 *     codebaseContext,
 *     onAttempt,
 *   });
 */

import { logger } from "@/lib/logger";

export const MAX_RETRIES = 3;

/** Per-attempt timeout for feedback AI calls (5 minutes, matching orchestrator STEP_TIMEOUT_MS). */
const FEEDBACK_TIMEOUT_MS = 5 * 60 * 1000;

export interface FeedbackLoopInput {
  taskDescription: string;
  /** The architecture/plan from the planning phase */
  architecturePlan: string;
  /** The implementation produced in the previous attempt */
  previousImplementation: string;
  /** Raw test output (stdout + stderr) from the test runner */
  testOutput: string;
  /** Code context from RAG (may be empty string) */
  codebaseContext: string;
  agentId: string;
  modelId: string;
  /** Current retry attempt number (1-based) */
  attempt: number;
}

export interface FeedbackLoopResult {
  /** Revised implementation (TypeScript code) */
  revisedImplementation: string;
  /** Human-readable failure analysis */
  failureAnalysis: string;
  /** true if the implementation was successfully revised */
  success: boolean;
  /** Prompt tokens consumed by this feedback iteration (0 on failure/timeout) */
  inputTokens: number;
  /** Completion tokens consumed by this feedback iteration (0 on failure/timeout) */
  outputTokens: number;
}

/**
 * Parse test output to extract failure summaries.
 * Handles Vitest, Jest, and generic test runner output.
 */
export function parseTestFailures(testOutput: string): string[] {
  const failures: string[] = [];

  // Vitest/Jest: lines starting with FAIL or ✗ or × or ●
  // Stack trace lines ("  at Object.foo (file.ts:42:12)") are excluded —
  // they are location metadata, not failure descriptions, and add noise to the AI prompt.
  const patterns = [
    /^\s*(FAIL|FAILED|✗|×)\s+(.+)$/gm,
    /^\s*●\s+(.+)$/gm,
    /Error:\s+\S.+$/gm,
    /AssertionError:\s+(.+)$/gm,
    /Expected\s+(.+?)\s+but\s+received\s+(.+)$/gm,
  ];

  for (const pattern of patterns) {
    const matches = testOutput.matchAll(pattern);
    for (const match of matches) {
      const line = match[0].trim();
      if (line.length > 10 && !failures.includes(line)) {
        failures.push(line);
      }
    }
  }

  // Deduplicate and limit
  return [...new Set(failures)].slice(0, 20);
}

/**
 * Build the feedback prompt for the re-implementation step.
 * This is injected into the AI call that fixes failing code.
 */
export function buildFeedbackPrompt(input: FeedbackLoopInput): string {
  const failures = parseTestFailures(input.testOutput);
  const failureBlock = failures.length > 0
    ? failures.map((f) => `  - ${f}`).join("\n")
    : input.testOutput.slice(0, 1000);

  return `# Task
${input.taskDescription}

# Architecture Plan
${input.architecturePlan.slice(0, 2000)}

${input.codebaseContext ? `${input.codebaseContext}\n\n` : ""}# Previous Implementation (Attempt ${input.attempt - 1})
The implementation below failed the tests. Study it carefully to understand what went wrong.

\`\`\`typescript
${input.previousImplementation.slice(0, 4000)}
\`\`\`

# Test Failures
The following test failures were reported:

${failureBlock}

# Full Test Output
\`\`\`
${input.testOutput.slice(0, 3000)}
\`\`\`

# Instructions
You are a senior engineer fixing a failing implementation. Based on the test failures above:

1. **Analyze** each failure — understand the root cause, not just the symptom
2. **Fix** the implementation — make targeted, minimal changes that address all failures
3. **Verify** your logic — trace through the test cases mentally before writing code
4. **Output** the complete revised implementation (all files, fully working)

Do NOT output the same broken code. Do NOT add TODO comments. Do NOT write placeholders.
Write complete, correct, production-ready TypeScript that passes all tests.

Attempt ${input.attempt} of ${MAX_RETRIES}. This is critical — be thorough.`;
}

/**
 * Run a single feedback iteration using the AI model.
 * Returns the revised implementation text.
 */
export async function runFeedbackIteration(
  input: FeedbackLoopInput,
  systemPrompt: string,
): Promise<FeedbackLoopResult> {
  const { getModel } = await import("@/lib/ai");
  const { generateText } = await import("ai");

  const model = getModel(input.modelId);
  const prompt = buildFeedbackPrompt(input);

  logger.info("feedback-loop: running revision attempt", {
    agentId: input.agentId,
    attempt: input.attempt,
    failureCount: parseTestFailures(input.testOutput).length,
  });

  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), FEEDBACK_TIMEOUT_MS);

  try {
    const result = await generateText({
      model,
      system: systemPrompt,
      prompt,
      maxOutputTokens: 8192,
      abortSignal: ac.signal,
    });

    const inputTokens = result.usage.inputTokens ?? 0;
    const outputTokens = result.usage.outputTokens ?? 0;

    logger.info("feedback-loop: revision attempt complete", {
      agentId: input.agentId,
      attempt: input.attempt,
      outputLength: result.text.length,
      inputTokens,
      outputTokens,
    });

    return {
      revisedImplementation: result.text,
      failureAnalysis: `Attempt ${input.attempt}: ${parseTestFailures(input.testOutput).slice(0, 3).join("; ")}`,
      success: true,
      inputTokens,
      outputTokens,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      logger.error("feedback-loop: revision timed out", err, {
        agentId: input.agentId,
        attempt: input.attempt,
        timeoutMs: FEEDBACK_TIMEOUT_MS,
      });
      return {
        revisedImplementation: input.previousImplementation,
        failureAnalysis: `Attempt ${input.attempt} timed out after ${FEEDBACK_TIMEOUT_MS / 1000}s`,
        success: false,
        inputTokens: 0,
        outputTokens: 0,
      };
    }
    logger.error("feedback-loop: revision attempt failed", err, {
      agentId: input.agentId,
      attempt: input.attempt,
    });

    return {
      revisedImplementation: input.previousImplementation,
      failureAnalysis: `Attempt ${input.attempt} failed: ${err instanceof Error ? err.message : String(err)}`,
      success: false,
      inputTokens: 0,
      outputTokens: 0,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Determine whether test output indicates failure.
 * Returns true if tests failed (retry needed).
 */
export function didTestsFail(testOutput: string): boolean {
  if (!testOutput) return false;

  const failSignals = [
    /\bFAIL\b/,
    /\bFAILED\b/,
    /\d+ failed/i,
    /test.*failed/i,
    /AssertionError/,
    /Error:\s+\S/,  // narrowed: requires non-whitespace after colon to avoid "Error: 0" false positives
    /✗/,
    /×/,
  ];

  const passSignals = [
    /\bPASS\b/,
    /\bpassed\b/i,
    /all tests passed/i,
    /✓/,
    /Tests:\s+\d+ passed/i,
  ];

  const hasFailure = failSignals.some((re) => re.test(testOutput));
  const hasPass = passSignals.some((re) => re.test(testOutput));

  // If explicit pass signals with no failures — consider it passing
  if (hasPass && !hasFailure) return false;
  return hasFailure;
}
