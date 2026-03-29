/**
 * Agent Evals — Run Orchestrator
 *
 * Loads a suite from DB, sends each test case through the agent chat API
 * (non-streaming), applies all assertions, persists EvalResult records,
 * and marks the EvalRun as COMPLETED or FAILED.
 *
 * Architecture:
 *   runEvalSuite(suiteId, agentId, options)
 *     ├── Load suite + test cases from DB
 *     ├── Create EvalRun (RUNNING)
 *     ├── For each test case (sequential — avoids rate limit issues):
 *     │   ├── POST /api/agents/[agentId]/chat  { stream: false }
 *     │   ├── Measure latency
 *     │   ├── evaluateAllAssertions()
 *     │   ├── Upsert EvalResult
 *     │   └── Increment passedCases / failedCases on run
 *     ├── Calculate overall score
 *     └── Update EvalRun (COMPLETED, score, durationMs, completedAt)
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { evaluateAllAssertions } from "./assertions";
import { EvalAssertionSchema } from "./schemas";
import type { AssertionContext, EvalAssertion, AssertionResult } from "./schemas";
import type {
  EvalTestCase,
} from "@/generated/prisma";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RunEvalOptions {
  /** Base URL for the chat API (defaults to http://localhost:3000) */
  baseUrl?: string;
  /** How the run was triggered */
  triggeredBy?: "manual" | "deploy" | "schedule" | "compare";
  /** Auth cookie or bearer token for the internal chat API call */
  authHeader?: string;
  /** Specific flow version to test (undefined = use active deployed version) */
  flowVersionId?: string;
  /** Model override for comparing different models */
  modelOverride?: string;
  /** Paired comparison run ID for A/B linking */
  comparisonRunId?: string;
  /** How to trigger the agent: "chat" sends a message, "webhook" calls /execute with payload */
  triggerMode?: "chat" | "webhook";
}

export interface EvalRunSummary {
  runId: string;
  status: string;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  score: number;
  durationMs: number;
  results: CaseRunResult[];
}

export interface CaseRunResult {
  testCaseId: string;
  label: string;
  status: "PASSED" | "FAILED" | "ERROR";
  agentOutput: string | null;
  score: number;
  latencyMs: number;
  assertionResults: import("./schemas").AssertionResult[];
  errorMessage?: string;
}

// ─── Timeout / retry constants ────────────────────────────────────────────────

/** Maximum time to wait for a single agent chat response (ms). */
export const EVAL_CHAT_TIMEOUT_MS = 45_000;

/** Maximum time to wait for a single LLM-as-Judge assertion evaluation (ms). */
export const EVAL_ASSERTION_TIMEOUT_MS = 15_000;

/** Number of retry attempts for transient chat API failures. */
export const EVAL_MAX_RETRIES = 3;

/** Base delay (ms) for exponential backoff between retries. */
const EVAL_RETRY_BASE_MS = 1_000;

/** HTTP status codes that warrant a retry (transient server/gateway errors). */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Parse the assertions JSON stored in DB, returning validated EvalAssertion[].
 * Exported as parseAssertionsForTest for unit testing.
 */
export function parseAssertionsForTest(raw: unknown): EvalAssertion[] {
  return parseAssertions(raw);
}

/** @internal Exported for unit testing only — not part of public API. */
export const callAgentChatForTest = callAgentChat;

/** @internal Exported for unit testing only — not part of public API. */
export const callAgentExecuteForTest = callAgentExecute;

/** @internal Exported for unit testing only — not part of public API. */
export const evaluateAssertionsWithTimeoutForTest = evaluateAllAssertionsWithTimeout;

function parseAssertions(raw: unknown): EvalAssertion[] {
  if (!Array.isArray(raw)) return [];
  const parsed: EvalAssertion[] = [];
  for (const item of raw) {
    const result = EvalAssertionSchema.safeParse(item);
    if (result.success) {
      parsed.push(result.data);
    }
  }
  return parsed;
}

/** Calculate average score across assertion results (0.0–1.0). */
function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** LLM-as-Judge assertion types that require external API calls and can hang. */
const LLM_JUDGE_TYPES = new Set(["llm_rubric", "kb_faithfulness", "relevance"]);

/**
 * Wrap evaluateAllAssertions with a per-assertion timeout for Layer 3 (LLM-as-Judge).
 * L1 (deterministic) and L2 (semantic) assertions run without a timeout since they
 * are fast and CPU/cache-bound. L3 assertions are wrapped in a race with a deadline.
 */
async function evaluateAllAssertionsWithTimeout(
  assertions: EvalAssertion[],
  ctx: AssertionContext,
): Promise<{ results: AssertionResult[]; score: number; passed: boolean }> {
  // Split into fast (L1+L2) and slow (L3) assertion groups
  const fastAssertions = assertions.filter((a) => !LLM_JUDGE_TYPES.has(a.type));
  const slowAssertions = assertions.filter((a) => LLM_JUDGE_TYPES.has(a.type));

  // Run fast assertions normally (no timeout needed)
  const fastResult = fastAssertions.length > 0
    ? await evaluateAllAssertions(fastAssertions, ctx)
    : { results: [] as AssertionResult[], score: 1, passed: true };

  if (slowAssertions.length === 0) {
    return fastResult;
  }

  // Run L3 assertions with a timeout guard
  let slowResult: { results: AssertionResult[]; score: number; passed: boolean };
  try {
    slowResult = await Promise.race([
      evaluateAllAssertions(slowAssertions, ctx),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`LLM-as-Judge timed out after ${EVAL_ASSERTION_TIMEOUT_MS / 1000}s`)),
          EVAL_ASSERTION_TIMEOUT_MS,
        ),
      ),
    ]);
  } catch (err) {
    // On timeout — mark all L3 assertions as failed with timeout message
    const message = err instanceof Error ? err.message : "LLM-as-Judge evaluation timed out";
    logger.warn("eval_assertion_timeout", { error: message, slowCount: slowAssertions.length });
    slowResult = {
      results: slowAssertions.map((a) => ({
        type: a.type,
        passed: false,
        score: 0,
        message,
      })),
      score: 0,
      passed: false,
    };
  }

  // Merge fast + slow results, recalculate overall score
  const allResults = [...fastResult.results, ...slowResult.results];
  const overallScore = average(allResults.map((r) => r.score));
  const overallPassed = allResults.every((r) => r.passed);

  return { results: allResults, score: overallScore, passed: overallPassed };
}

// ─── Chat API caller ──────────────────────────────────────────────────────────

/**
 * Sentinel error subclass used to signal that a chat API error should NOT be
 * retried (e.g. 400, 401, 403, 404 — client errors where retrying is pointless).
 * The catch block inside the retry loop checks for this type and re-throws immediately.
 */
class NonRetryableChatError extends Error {
  constructor(
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = "NonRetryableChatError";
  }
}

interface ChatResponse {
  output: string;
  latencyMs: number;
  retryCount: number;
}

interface KBSearchResult {
  content: string;
  score?: number;
}

/**
 * Send a single message to the agent chat API (non-streaming).
 * Includes timeout protection (EVAL_CHAT_TIMEOUT_MS) and exponential-backoff
 * retries for transient errors (429, 5xx). Non-transient errors (4xx) are
 * thrown immediately without retrying.
 *
 * Returns the agent's text output, measured latency, and retry count.
 */
async function callAgentChat(
  agentId: string,
  input: string,
  baseUrl: string,
  authHeader?: string,
  flowVersionId?: string,
  modelOverride?: string,
): Promise<ChatResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authHeader) {
    headers["Cookie"] = authHeader;
  }

  const body: Record<string, unknown> = {
    message: input,
    stream: false,
    isEval: true, // flag for optional cleanup in chat route
  };
  if (flowVersionId) body.flowVersionId = flowVersionId;
  if (modelOverride) body.modelOverride = modelOverride;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= EVAL_MAX_RETRIES; attempt++) {
    // Exponential backoff with ±25% jitter — skip on first attempt
    if (attempt > 0) {
      const delay = EVAL_RETRY_BASE_MS * Math.pow(2, attempt - 1) * (0.75 + Math.random() * 0.5);
      await new Promise((resolve) => setTimeout(resolve, Math.round(delay)));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EVAL_CHAT_TIMEOUT_MS);

    const start = Date.now();
    try {
      const response = await fetch(`${baseUrl}/api/agents/${agentId}/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latencyMs = Date.now() - start;

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        const message = `Chat API returned ${response.status}: ${text.slice(0, 200)}`;

        if (RETRYABLE_STATUS_CODES.has(response.status)) {
          // Transient server error — retry if attempts remain
          if (attempt < EVAL_MAX_RETRIES) {
            logger.warn("eval_chat_retry", {
              agentId, attempt: attempt + 1, status: response.status,
            });
            lastError = new Error(message);
            continue;
          }
          // Max retries exhausted — throw accumulated retry error
          throw new Error(`Chat API failed after ${EVAL_MAX_RETRIES} retries: ${message}`);
        }

        // Non-retryable HTTP error (4xx client errors) — throw a typed error that
        // the catch block will re-throw immediately without entering the retry loop.
        throw new NonRetryableChatError(response.status, message);
      }

      const data = (await response.json()) as {
        success: boolean;
        data?: {
          message?: string;
          response?: string;
          messages?: { role: string; content: string }[];
        };
        error?: string;
      };

      if (!data.success) {
        throw new Error(data.error ?? "Chat API returned success: false");
      }

      // The chat route returns { success: true, data: { messages: [{role, content}] } }
      // Support legacy message/response fields as fallback
      const assistantMessages = data.data?.messages?.filter((m) => m.role === "assistant") ?? [];
      const fromMessages = assistantMessages.map((m) => m.content).join("\n").trim();
      const output = fromMessages || (data.data?.message ?? data.data?.response ?? "");

      return { output, latencyMs, retryCount: attempt };
    } catch (err) {
      clearTimeout(timeoutId);

      // AbortError = timeout — do not retry (agent is genuinely slow / stuck)
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(
          `Chat API timed out after ${EVAL_CHAT_TIMEOUT_MS / 1000}s — the agent did not respond in time`,
        );
      }

      // Non-retryable HTTP error (4xx) — re-throw immediately, no retry
      if (err instanceof NonRetryableChatError) {
        throw err;
      }

      // Re-throw non-retryable errors immediately
      if (attempt >= EVAL_MAX_RETRIES) {
        if (lastError) {
          throw new Error(
            `Chat API failed after ${EVAL_MAX_RETRIES} retries: ${lastError.message}`,
          );
        }
        throw err;
      }

      lastError = err instanceof Error ? err : new Error(String(err));
      logger.warn("eval_chat_retry", { agentId, attempt: attempt + 1, error: lastError.message });
    }
  }

  // Should never reach here — loop always returns or throws
  throw lastError ?? new Error("Chat API failed after retries");
}

// ─── Execute API caller (webhook-triggered flows) ────────────────────────────

/** Timeout for webhook-triggered execute calls (longer than chat). */
const EVAL_EXECUTE_TIMEOUT_MS = 120_000;

/**
 * Trigger a flow execution via the /execute endpoint instead of /chat.
 * Used for webhook-triggered flows that don't accept chat messages.
 */
async function callAgentExecute(
  agentId: string,
  input: string,
  baseUrl: string,
  authHeader?: string,
): Promise<ChatResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authHeader) {
    headers["Cookie"] = authHeader;
  }

  let webhookPayload: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(input);
    if (typeof parsed === "object" && parsed !== null) {
      webhookPayload = parsed as Record<string, unknown>;
    }
  } catch {
    webhookPayload = { message: input };
  }

  const body = {
    input: {
      ...webhookPayload,
      __webhook_payload: webhookPayload,
      __webhook_event_type: "eval.test",
      __trigger_type: "webhook_eval",
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EVAL_EXECUTE_TIMEOUT_MS);

  const start = Date.now();
  try {
    const response = await fetch(`${baseUrl}/api/agents/${agentId}/execute`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - start;

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Execute API returned ${response.status}: ${text.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      success: boolean;
      data?: { output?: string };
      error?: string;
    };

    if (!data.success) {
      throw new Error(data.error ?? "Execute API returned success: false");
    }

    return {
      output: data.data?.output ?? "",
      latencyMs,
      retryCount: 0,
    };
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `Execute API timed out after ${EVAL_EXECUTE_TIMEOUT_MS / 1000}s — webhook flow did not complete in time`,
      );
    }
    throw err;
  }
}

// ─── KB Context fetcher (for kb_faithfulness assertions) ─────────────────────

/**
 * Fetch KB context for a given query by calling the knowledge search API.
 * Returns the concatenated text of all search results, or undefined on failure.
 * This is only called when the test case includes kb_faithfulness assertions.
 */
async function fetchKBContext(
  agentId: string,
  query: string,
  baseUrl: string,
  authHeader?: string,
): Promise<string | undefined> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (authHeader) {
      headers["Cookie"] = authHeader;
    }

    const response = await fetch(
      `${baseUrl}/api/agents/${agentId}/knowledge/search`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ query, topK: 10 }),
      },
    );

    if (!response.ok) return undefined;

    const data = (await response.json()) as {
      success: boolean;
      data?: KBSearchResult[];
    };

    if (!data.success || !Array.isArray(data.data) || data.data.length === 0) {
      return undefined;
    }

    return data.data.map((r) => r.content).join("\n\n");
  } catch (err) {
    logger.warn("eval_kb_context_fetch_failed", {
      agentId,
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

// ─── Main orchestrator ────────────────────────────────────────────────────────

/**
 * Run all test cases in an eval suite and persist results to the DB.
 * Returns a summary of the run.
 */
export async function runEvalSuite(
  suiteId: string,
  agentId: string,
  options: RunEvalOptions = {},
): Promise<EvalRunSummary> {
  const baseUrl = options.baseUrl ?? "http://localhost:3000";
  const triggeredBy = options.triggeredBy ?? "manual";

  // ── 1. Load suite with test cases ─────────────────────────────────────────
  const suite = await prisma.evalSuite.findUniqueOrThrow({
    where: { id: suiteId, agentId },
    include: {
      testCases: {
        orderBy: { order: "asc" },
      },
    },
  });

  const totalCases = suite.testCases.length;
  const flowVersionId = options.flowVersionId;
  const modelOverride = options.modelOverride;
  const comparisonRunId = options.comparisonRunId;

  // ── 2. Create EvalRun record ───────────────────────────────────────────────
  const run = await prisma.evalRun.create({
    data: {
      suiteId,
      status: "RUNNING",
      totalCases,
      triggeredBy,
      // Head-to-head comparison fields (stored as-is; Prisma will ignore unknown fields
      // until db:push is run on Railway — these are gracefully ignored locally)
      ...(flowVersionId ? { flowVersionId } : {}),
      ...(modelOverride ? { modelOverride } : {}),
      ...(comparisonRunId ? { comparisonRunId } : {}),
    } as Parameters<typeof prisma.evalRun.create>[0]["data"],
  });

  const runStart = Date.now();
  const caseResults: CaseRunResult[] = [];
  let passedCases = 0;
  let failedCases = 0;

  logger.info("eval_run_started", {
    runId: run.id,
    suiteId,
    agentId,
    totalCases,
    triggeredBy,
  });

  // ── 3. Execute each test case sequentially ─────────────────────────────────
  for (const testCase of suite.testCases) {
    const caseResult = await runSingleTestCase(
      testCase,
      agentId,
      run.id,
      baseUrl,
      options.authHeader,
      flowVersionId,
      modelOverride,
      options.triggerMode,
    );

    caseResults.push(caseResult);

    if (caseResult.status === "PASSED") {
      passedCases++;
    } else {
      failedCases++;
    }

    // Update run progress after each case
    await prisma.evalRun.update({
      where: { id: run.id },
      data: { passedCases, failedCases },
    });
  }

  // ── 4. Finalise run ────────────────────────────────────────────────────────
  const durationMs = Date.now() - runStart;
  const overallScore =
    totalCases > 0
      ? average(caseResults.map((r) => r.score))
      : 0;

  const finalRun = await prisma.evalRun.update({
    where: { id: run.id },
    data: {
      status: "COMPLETED",
      passedCases,
      failedCases,
      score: overallScore,
      durationMs,
      completedAt: new Date(),
    },
  });

  logger.info("eval_run_completed", {
    runId: run.id,
    suiteId,
    agentId,
    passedCases,
    failedCases,
    score: overallScore,
    durationMs,
  });

  return {
    runId: finalRun.id,
    status: finalRun.status,
    totalCases,
    passedCases,
    failedCases,
    score: overallScore,
    durationMs,
    results: caseResults,
  };
}

// ─── Single test case runner ──────────────────────────────────────────────────

async function runSingleTestCase(
  testCase: EvalTestCase,
  agentId: string,
  runId: string,
  baseUrl: string,
  authHeader?: string,
  flowVersionId?: string,
  modelOverride?: string,
  triggerMode?: "chat" | "webhook",
): Promise<CaseRunResult> {
  const assertions = parseAssertions(testCase.assertions);

  let agentOutput: string | null = null;
  let latencyMs = 0;
  let errorMessage: string | undefined;
  let assertionResults: Awaited<ReturnType<typeof evaluateAllAssertions>>["results"] = [];
  let score = 0;
  let passed = false;
  let status: "PASSED" | "FAILED" | "ERROR" = "ERROR";

  try {
    let chat: ChatResponse;

    if (triggerMode === "webhook") {
      // Webhook mode: call /execute with payload instead of /chat
      chat = await callAgentExecute(agentId, testCase.input, baseUrl, authHeader);
    } else {
      // Default chat mode
      chat = await callAgentChat(
        agentId,
        testCase.input,
        baseUrl,
        authHeader,
        flowVersionId,
        modelOverride,
      );
    }

    agentOutput = chat.output;
    latencyMs = chat.latencyMs;

    // Fetch KB context if any assertions need it (kb_faithfulness)
    let kbContext: string | undefined;
    const needsKBContext = assertions.some((a) => a.type === "kb_faithfulness");
    if (needsKBContext) {
      kbContext = await fetchKBContext(agentId, testCase.input, baseUrl, authHeader);
    }

    // Build assertion context
    const ctx: AssertionContext = {
      input: testCase.input,
      output: agentOutput,
      latencyMs,
      ...(kbContext ? { kbContext } : {}),
    };

    // Evaluate assertions — wrap with per-assertion timeout for Layer 3 (LLM-as-Judge)
    const evalResult = await evaluateAllAssertionsWithTimeout(assertions, ctx);
    assertionResults = evalResult.results;
    score = evalResult.score;
    passed = evalResult.passed;
    status = passed ? "PASSED" : "FAILED";
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    status = "ERROR";
    score = 0;

    logger.warn("eval_test_case_error", {
      testCaseId: testCase.id,
      runId,
      error: errorMessage,
    });
  }

  // Persist EvalResult
  await prisma.evalResult.create({
    data: {
      runId,
      testCaseId: testCase.id,
      status,
      agentOutput,
      assertions: assertionResults as import("@/generated/prisma/runtime/library").InputJsonValue,
      score,
      latencyMs: latencyMs > 0 ? latencyMs : null,
      errorMessage,
    },
  });

  return {
    testCaseId: testCase.id,
    label: testCase.label,
    status,
    agentOutput,
    score,
    latencyMs,
    assertionResults,
    errorMessage,
  };
}

// ─── Failure handler: mark run as FAILED ──────────────────────────────────────

/**
 * Mark an in-progress run as FAILED with an error message.
 * Call this if runEvalSuite itself throws unexpectedly.
 */
export async function failEvalRun(
  runId: string,
  errorMessage: string,
): Promise<void> {
  await prisma.evalRun.update({
    where: { id: runId },
    data: {
      status: "FAILED",
      errorMessage,
      completedAt: new Date(),
    },
  }).catch(() => {
    // Ignore DB errors during cleanup
  });
}
