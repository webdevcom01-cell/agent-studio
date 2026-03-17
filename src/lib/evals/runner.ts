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
import type { AssertionContext, EvalAssertion } from "./schemas";
import type {
  EvalRun,
  EvalResult,
  EvalTestCase,
} from "@/generated/prisma";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RunEvalOptions {
  /** Base URL for the chat API (defaults to http://localhost:3000) */
  baseUrl?: string;
  /** How the run was triggered */
  triggeredBy?: "manual" | "deploy" | "schedule";
  /** Auth cookie or bearer token for the internal chat API call */
  authHeader?: string;
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

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Parse the assertions JSON stored in DB, returning validated EvalAssertion[].
 * Exported as parseAssertionsForTest for unit testing.
 */
export function parseAssertionsForTest(raw: unknown): EvalAssertion[] {
  return parseAssertions(raw);
}

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

// ─── Chat API caller ──────────────────────────────────────────────────────────

interface ChatResponse {
  output: string;
  latencyMs: number;
}

/**
 * Send a single message to the agent chat API (non-streaming).
 * Creates a temporary conversation that will be cleaned up.
 * Returns the agent's text output and measured latency.
 */
async function callAgentChat(
  agentId: string,
  input: string,
  baseUrl: string,
  authHeader?: string,
): Promise<ChatResponse> {
  const start = Date.now();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authHeader) {
    headers["Cookie"] = authHeader;
  }

  const response = await fetch(
    `${baseUrl}/api/agents/${agentId}/chat`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        message: input,
        stream: false,
        isEval: true, // flag for optional cleanup in chat route
      }),
    },
  );

  const latencyMs = Date.now() - start;

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Chat API returned ${response.status}: ${text.slice(0, 200)}`,
    );
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

  return { output, latencyMs };
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

  // ── 2. Create EvalRun record ───────────────────────────────────────────────
  const run = await prisma.evalRun.create({
    data: {
      suiteId,
      status: "RUNNING",
      totalCases,
      triggeredBy,
    },
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
    // Call the agent
    const chat = await callAgentChat(
      agentId,
      testCase.input,
      baseUrl,
      authHeader,
    );

    agentOutput = chat.output;
    latencyMs = chat.latencyMs;

    // Build assertion context
    const ctx: AssertionContext = {
      input: testCase.input,
      output: agentOutput,
      latencyMs,
    };

    // Evaluate assertions
    const evalResult = await evaluateAllAssertions(assertions, ctx);
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
