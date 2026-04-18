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
import {
  parseTscErrors,
  parseVitestFailures,
  formatErrorsForFeedback,
  hasTestFailures,
} from "@/lib/sdlc/error-parser";

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
 * Build the feedback prompt for the re-implementation step.
 * This is injected into the AI call that fixes failing code.
 */
export function buildFeedbackPrompt(input: FeedbackLoopInput): string {
  const tscErrors = parseTscErrors(input.testOutput);
  const vitestFailures = parseVitestFailures(input.testOutput);
  const structuredErrors = formatErrorsForFeedback(tscErrors, vitestFailures);
  const errorSection = structuredErrors
    ? `# Errors (Structured)\n${structuredErrors}`
    : `# Raw Output\n\`\`\`\n${input.testOutput.slice(0, 2000)}\n\`\`\``;

  return `# Task
${input.taskDescription}

# Architecture Plan
${input.architecturePlan.slice(0, 2000)}

${input.codebaseContext ? `${input.codebaseContext}\n\n` : ""}# Previous Implementation (Attempt ${input.attempt - 1})
The implementation below failed the tests. Study it carefully to understand what went wrong.

\`\`\`typescript
${input.previousImplementation.slice(0, 4000)}
\`\`\`

${errorSection}

# Instructions
You are a senior engineer fixing a failing implementation. Based on the test failures above:

1. **Analyze** each failure — understand the root cause, not just the symptom
2. **Fix** the implementation — make targeted, minimal changes that address all failures
3. **Verify** your logic — trace through the test cases mentally before writing code
4. **Output** the complete revised implementation (all files, fully working)

Do NOT output the same broken code. Do NOT add TODO comments. Do NOT write placeholders.
Write complete, correct, production-ready TypeScript that passes all tests.

Attempt ${input.attempt} of ${MAX_RETRIES}. This is critical — be thorough.${input.attempt >= 2 ? `

## IMPORTANT: Use SEARCH/REPLACE format for changes
For each change, output blocks in this exact format:
File: path/to/file.ts
<<<<<<< SEARCH
(exact text to find — must match file exactly)
=======
(replacement text)
>>>>>>> REPLACE` : ""}`;
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
    failureCount: parseVitestFailures(input.testOutput).length,
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
      failureAnalysis: `Attempt ${input.attempt}: ${parseVitestFailures(input.testOutput).slice(0, 3).map((f) => f.testName).join("; ")}`,
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
  return (
    hasTestFailures(testOutput) ||
    /\bFAIL\b/.test(testOutput) ||
    /\bfailed\b/i.test(testOutput)
  );
}
