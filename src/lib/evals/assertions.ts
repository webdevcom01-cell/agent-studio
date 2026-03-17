/**
 * Agent Evals — Assertion Evaluators
 *
 * Phase 1 implements Layer 1 (deterministic) assertions only.
 * Layer 2 (semantic_similarity) and Layer 3 (llm_rubric, kb_faithfulness,
 * relevance) are stubbed with clear errors — implemented in Phase 2.
 */

import type {
  AssertionContext,
  AssertionResult,
  EvalAssertion,
} from "./schemas";

// ─── Layer 1: Deterministic Evaluators ───────────────────────────────────────

function evaluateExactMatch(
  output: string,
  value: string,
): AssertionResult {
  const passed = output === value;
  return {
    type: "exact_match",
    passed,
    score: passed ? 1 : 0,
    message: passed
      ? "Output exactly matches expected value."
      : `Expected exact value "${value}", got "${output.slice(0, 120)}${output.length > 120 ? "…" : ""}"`,
  };
}

function evaluateContains(
  output: string,
  value: string,
): AssertionResult {
  const passed = output.includes(value);
  return {
    type: "contains",
    passed,
    score: passed ? 1 : 0,
    message: passed
      ? `Output contains "${value}".`
      : `Expected output to contain "${value}", but it did not.`,
  };
}

function evaluateIContains(
  output: string,
  value: string,
): AssertionResult {
  const passed = output.toLowerCase().includes(value.toLowerCase());
  return {
    type: "icontains",
    passed,
    score: passed ? 1 : 0,
    message: passed
      ? `Output contains "${value}" (case-insensitive).`
      : `Expected output to contain "${value}" (case-insensitive), but it did not.`,
  };
}

function evaluateNotContains(
  output: string,
  value: string,
): AssertionResult {
  const passed = !output.includes(value);
  return {
    type: "not_contains",
    passed,
    score: passed ? 1 : 0,
    message: passed
      ? `Output correctly does not contain "${value}".`
      : `Expected output to NOT contain "${value}", but it did.`,
  };
}

function evaluateRegex(
  output: string,
  pattern: string,
): AssertionResult {
  let passed: boolean;
  let errorDetail: string | undefined;
  try {
    const re = new RegExp(pattern);
    passed = re.test(output);
  } catch {
    passed = false;
    errorDetail = `Invalid regex pattern: "${pattern}"`;
  }
  return {
    type: "regex",
    passed,
    score: passed ? 1 : 0,
    message: passed
      ? `Output matches regex /${pattern}/.`
      : errorDetail ?? `Output does not match regex /${pattern}/.`,
    details: errorDetail ? { error: errorDetail } : undefined,
  };
}

function evaluateStartsWith(
  output: string,
  value: string,
): AssertionResult {
  const passed = output.startsWith(value);
  return {
    type: "starts_with",
    passed,
    score: passed ? 1 : 0,
    message: passed
      ? `Output starts with "${value}".`
      : `Expected output to start with "${value}", but it starts with "${output.slice(0, value.length + 20)}"`,
  };
}

function evaluateJsonValid(output: string): AssertionResult {
  let passed: boolean;
  try {
    JSON.parse(output);
    passed = true;
  } catch {
    passed = false;
  }
  return {
    type: "json_valid",
    passed,
    score: passed ? 1 : 0,
    message: passed
      ? "Output is valid JSON."
      : "Output is not valid JSON.",
  };
}

function evaluateLatency(
  latencyMs: number,
  threshold: number,
): AssertionResult {
  const passed = latencyMs <= threshold;
  return {
    type: "latency",
    passed,
    score: passed ? 1 : 0,
    message: passed
      ? `Response time ${latencyMs}ms is within ${threshold}ms threshold.`
      : `Response time ${latencyMs}ms exceeds ${threshold}ms threshold.`,
    details: { latencyMs, threshold },
  };
}

// ─── Layer 2 & 3: Stubs (implemented in Phase 2) ─────────────────────────────

function stubNotImplemented(type: string): AssertionResult {
  return {
    type,
    passed: false,
    score: 0,
    message: `Assertion type "${type}" requires Phase 2 (semantic/LLM evaluators) — not yet implemented.`,
    details: { phase: 2 },
  };
}

// ─── Main Dispatcher ──────────────────────────────────────────────────────────

/**
 * Evaluate a single assertion against the agent output context.
 * Always resolves — never throws. Errors are captured as failed assertions.
 */
export async function evaluateAssertion(
  assertion: EvalAssertion,
  ctx: AssertionContext,
): Promise<AssertionResult> {
  try {
    switch (assertion.type) {
      case "exact_match":
        return evaluateExactMatch(ctx.output, assertion.value);

      case "contains":
        return evaluateContains(ctx.output, assertion.value);

      case "icontains":
        return evaluateIContains(ctx.output, assertion.value);

      case "not_contains":
        return evaluateNotContains(ctx.output, assertion.value);

      case "regex":
        return evaluateRegex(ctx.output, assertion.value);

      case "starts_with":
        return evaluateStartsWith(ctx.output, assertion.value);

      case "json_valid":
        return evaluateJsonValid(ctx.output);

      case "latency":
        return evaluateLatency(ctx.latencyMs, assertion.threshold);

      case "semantic_similarity":
        return stubNotImplemented("semantic_similarity");

      case "llm_rubric":
        return stubNotImplemented("llm_rubric");

      case "kb_faithfulness":
        return stubNotImplemented("kb_faithfulness");

      case "relevance":
        return stubNotImplemented("relevance");

      default: {
        // TypeScript exhaustiveness guard
        const _exhaustive: never = assertion;
        return {
          type: "unknown",
          passed: false,
          score: 0,
          message: `Unknown assertion type: ${String((_exhaustive as EvalAssertion).type)}`,
        };
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      type: assertion.type,
      passed: false,
      score: 0,
      message: `Assertion evaluation error: ${message}`,
      details: { error: message },
    };
  }
}

/**
 * Evaluate all assertions for a test case.
 * Returns results in the same order as the input assertions.
 * Calculates an aggregate score (average of all assertion scores).
 */
export async function evaluateAllAssertions(
  assertions: EvalAssertion[],
  ctx: AssertionContext,
): Promise<{ results: AssertionResult[]; score: number; passed: boolean }> {
  const results = await Promise.all(
    assertions.map((a) => evaluateAssertion(a, ctx)),
  );

  const totalScore = results.reduce((sum, r) => sum + r.score, 0);
  const score = results.length > 0 ? totalScore / results.length : 0;
  const passed = results.every((r) => r.passed);

  return { results, score, passed };
}
