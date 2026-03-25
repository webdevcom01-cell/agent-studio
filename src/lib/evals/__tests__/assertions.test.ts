import { describe, it, expect, vi } from "vitest";

// Mock Layer 2 + 3 modules — they require network calls (embeddings / AI).
// Real implementations are unit-tested in semantic.test.ts and llm-judge.test.ts.
vi.mock("../semantic", () => ({
  evaluateSemanticSimilarity: vi.fn().mockResolvedValue({
    type: "semantic_similarity",
    passed: true,
    score: 0.92,
    message: "Mock semantic similarity 0.920 meets threshold 0.8.",
    details: { similarity: 0.92, threshold: 0.8 },
  }),
}));
vi.mock("../llm-judge", () => ({
  evaluateLLMRubric: vi.fn().mockResolvedValue({
    type: "llm_rubric",
    passed: true,
    score: 0.85,
    message: "Mock LLM rubric score 0.85 meets threshold 0.7.",
    details: { score: 0.85, threshold: 0.7, reasoning: "Correct." },
  }),
  evaluateKBFaithfulness: vi.fn().mockResolvedValue({
    type: "kb_faithfulness",
    passed: true,
    score: 0.9,
    message: "Mock faithfulness score 0.90 meets threshold 0.7.",
    details: { score: 0.9, threshold: 0.7, reasoning: "Grounded." },
  }),
  evaluateRelevance: vi.fn().mockResolvedValue({
    type: "relevance",
    passed: true,
    score: 0.88,
    message: "Mock relevance score 0.88 meets threshold 0.7.",
    details: { score: 0.88, threshold: 0.7, reasoning: "Relevant." },
  }),
}));

import { evaluateAssertion, evaluateAllAssertions } from "../assertions";
import type { AssertionContext } from "../schemas";

// ─── Test fixture ─────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<AssertionContext> = {}): AssertionContext {
  return {
    input: "What is the capital of France?",
    output: "The capital of France is Paris.",
    latencyMs: 250,
    ...overrides,
  };
}

// ─── exact_match ──────────────────────────────────────────────────────────────

describe("exact_match", () => {
  it("passes when output equals value exactly", async () => {
    const ctx = makeCtx({ output: "Paris" });
    const result = await evaluateAssertion(
      { type: "exact_match", value: "Paris" },
      ctx,
    );
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
  });

  it("fails when output does not match", async () => {
    const ctx = makeCtx({ output: "The capital is Paris." });
    const result = await evaluateAssertion(
      { type: "exact_match", value: "Paris" },
      ctx,
    );
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  it("fails on case difference", async () => {
    const ctx = makeCtx({ output: "paris" });
    const result = await evaluateAssertion(
      { type: "exact_match", value: "Paris" },
      ctx,
    );
    expect(result.passed).toBe(false);
  });

  it("returns a human-readable message", async () => {
    const result = await evaluateAssertion(
      { type: "exact_match", value: "hello" },
      makeCtx({ output: "world" }),
    );
    expect(result.message).toMatch(/hello/);
  });
});

// ─── contains ─────────────────────────────────────────────────────────────────

describe("contains", () => {
  it("passes when output contains the value", async () => {
    const result = await evaluateAssertion(
      { type: "contains", value: "Paris" },
      makeCtx(),
    );
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
  });

  it("fails when output does not contain the value", async () => {
    const result = await evaluateAssertion(
      { type: "contains", value: "London" },
      makeCtx(),
    );
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  it("is case-sensitive", async () => {
    const result = await evaluateAssertion(
      { type: "contains", value: "paris" },
      makeCtx({ output: "Paris is the capital." }),
    );
    expect(result.passed).toBe(false);
  });
});

// ─── icontains ────────────────────────────────────────────────────────────────

describe("icontains", () => {
  it("passes regardless of case", async () => {
    const result = await evaluateAssertion(
      { type: "icontains", value: "PARIS" },
      makeCtx({ output: "paris is the capital." }),
    );
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
  });

  it("passes with mixed case needle", async () => {
    const result = await evaluateAssertion(
      { type: "icontains", value: "PaRiS" },
      makeCtx({ output: "The capital is PARIS." }),
    );
    expect(result.passed).toBe(true);
  });

  it("fails when value is not present", async () => {
    const result = await evaluateAssertion(
      { type: "icontains", value: "london" },
      makeCtx(),
    );
    expect(result.passed).toBe(false);
  });
});

// ─── not_contains ─────────────────────────────────────────────────────────────

describe("not_contains", () => {
  it("passes when value is absent", async () => {
    const result = await evaluateAssertion(
      { type: "not_contains", value: "sorry" },
      makeCtx({ output: "The capital is Paris." }),
    );
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
  });

  it("fails when value is present", async () => {
    const result = await evaluateAssertion(
      { type: "not_contains", value: "Paris" },
      makeCtx(),
    );
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  it("is useful for hallucination detection", async () => {
    const result = await evaluateAssertion(
      { type: "not_contains", value: "I don't know" },
      makeCtx({ output: "The capital is Paris." }),
    );
    expect(result.passed).toBe(true);
  });
});

// ─── regex ────────────────────────────────────────────────────────────────────

describe("regex", () => {
  it("passes when output matches pattern", async () => {
    const result = await evaluateAssertion(
      { type: "regex", value: "Paris|Lyon|Marseille" },
      makeCtx(),
    );
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
  });

  it("fails when output does not match pattern", async () => {
    const result = await evaluateAssertion(
      { type: "regex", value: "^\\d{3}-\\d{4}$" },
      makeCtx({ output: "The capital is Paris." }),
    );
    expect(result.passed).toBe(false);
  });

  it("handles case-insensitive flag via JS regex syntax", async () => {
    // JavaScript uses /pattern/i syntax — pass the i flag inside RegExp()
    const result = await evaluateAssertion(
      { type: "regex", value: "(?:PARIS|paris)" },
      makeCtx({ output: "PARIS is the answer." }),
    );
    expect(result.passed).toBe(true);
  });

  it("fails gracefully on invalid regex", async () => {
    const result = await evaluateAssertion(
      { type: "regex", value: "([unclosed" },
      makeCtx(),
    );
    expect(result.passed).toBe(false);
    expect(result.message).toMatch(/[Ii]nvalid regex/);
  });

  it("matches email pattern", async () => {
    const result = await evaluateAssertion(
      { type: "regex", value: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}" },
      makeCtx({ output: "Contact us at support@example.com for help." }),
    );
    expect(result.passed).toBe(true);
  });
});

// ─── starts_with ──────────────────────────────────────────────────────────────

describe("starts_with", () => {
  it("passes when output starts with value", async () => {
    const result = await evaluateAssertion(
      { type: "starts_with", value: "The capital" },
      makeCtx(),
    );
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
  });

  it("fails when output does not start with value", async () => {
    const result = await evaluateAssertion(
      { type: "starts_with", value: "Paris" },
      makeCtx(),
    );
    expect(result.passed).toBe(false);
  });

  it("is case-sensitive", async () => {
    const result = await evaluateAssertion(
      { type: "starts_with", value: "the capital" },
      makeCtx({ output: "The capital of France is Paris." }),
    );
    expect(result.passed).toBe(false);
  });
});

// ─── json_valid ───────────────────────────────────────────────────────────────

describe("json_valid", () => {
  it("passes for valid JSON object", async () => {
    const result = await evaluateAssertion(
      { type: "json_valid" },
      makeCtx({ output: '{"city":"Paris","country":"France"}' }),
    );
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
  });

  it("passes for valid JSON array", async () => {
    const result = await evaluateAssertion(
      { type: "json_valid" },
      makeCtx({ output: '["Paris","Lyon","Marseille"]' }),
    );
    expect(result.passed).toBe(true);
  });

  it("passes for JSON number/boolean", async () => {
    const result = await evaluateAssertion(
      { type: "json_valid" },
      makeCtx({ output: "42" }),
    );
    expect(result.passed).toBe(true);
  });

  it("fails for plain text", async () => {
    const result = await evaluateAssertion(
      { type: "json_valid" },
      makeCtx({ output: "The capital of France is Paris." }),
    );
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  it("fails for malformed JSON", async () => {
    const result = await evaluateAssertion(
      { type: "json_valid" },
      makeCtx({ output: "{city: 'Paris'}" }),
    );
    expect(result.passed).toBe(false);
  });
});

// ─── latency ──────────────────────────────────────────────────────────────────

describe("latency", () => {
  it("passes when latency is within threshold", async () => {
    const result = await evaluateAssertion(
      { type: "latency", threshold: 500 },
      makeCtx({ latencyMs: 250 }),
    );
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
  });

  it("passes when latency equals threshold exactly", async () => {
    const result = await evaluateAssertion(
      { type: "latency", threshold: 250 },
      makeCtx({ latencyMs: 250 }),
    );
    expect(result.passed).toBe(true);
  });

  it("fails when latency exceeds threshold", async () => {
    const result = await evaluateAssertion(
      { type: "latency", threshold: 100 },
      makeCtx({ latencyMs: 500 }),
    );
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  it("includes latency details in result", async () => {
    const result = await evaluateAssertion(
      { type: "latency", threshold: 100 },
      makeCtx({ latencyMs: 300 }),
    );
    expect(result.details).toMatchObject({ latencyMs: 300, threshold: 100 });
  });
});

// ─── Layer 2 & 3 (mocked) ────────────────────────────────────────────────────

describe("Layer 2 & 3 assertions (mocked evaluators)", () => {
  it("semantic_similarity delegates to evaluateSemanticSimilarity", async () => {
    const result = await evaluateAssertion(
      { type: "semantic_similarity", value: "Paris is the capital.", threshold: 0.8 },
      makeCtx(),
    );
    expect(result.type).toBe("semantic_similarity");
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it("llm_rubric delegates to evaluateLLMRubric", async () => {
    const result = await evaluateAssertion(
      { type: "llm_rubric", rubric: "Response is helpful and accurate.", threshold: 0.7 },
      makeCtx(),
    );
    expect(result.type).toBe("llm_rubric");
    expect(result.passed).toBe(true);
    expect(result.details).toHaveProperty("reasoning");
  });

  it("kb_faithfulness delegates to evaluateKBFaithfulness", async () => {
    const result = await evaluateAssertion(
      { type: "kb_faithfulness", threshold: 0.7 },
      makeCtx({ kbContext: "France is a country in Western Europe. Paris is its capital." }),
    );
    expect(result.type).toBe("kb_faithfulness");
    expect(result.passed).toBe(true);
  });

  it("relevance delegates to evaluateRelevance", async () => {
    const result = await evaluateAssertion(
      { type: "relevance", threshold: 0.7 },
      makeCtx(),
    );
    expect(result.type).toBe("relevance");
    expect(result.passed).toBe(true);
  });
});

// ─── evaluateAllAssertions ────────────────────────────────────────────────────

describe("evaluateAllAssertions", () => {
  it("returns all results in order", async () => {
    const ctx = makeCtx();
    const { results } = await evaluateAllAssertions(
      [
        { type: "contains", value: "Paris" },
        { type: "not_contains", value: "London" },
      ],
      ctx,
    );
    expect(results).toHaveLength(2);
    expect(results[0].type).toBe("contains");
    expect(results[1].type).toBe("not_contains");
  });

  it("calculates average score", async () => {
    const ctx = makeCtx({ output: "Paris" });
    const { score } = await evaluateAllAssertions(
      [
        { type: "contains", value: "Paris" },  // score 1
        { type: "contains", value: "London" }, // score 0
      ],
      ctx,
    );
    expect(score).toBeCloseTo(0.5);
  });

  it("passed is true only when all assertions pass", async () => {
    const ctx = makeCtx();
    const { passed } = await evaluateAllAssertions(
      [
        { type: "contains", value: "Paris" },  // passes
        { type: "contains", value: "London" }, // fails
      ],
      ctx,
    );
    expect(passed).toBe(false);
  });

  it("passed is true when all assertions pass", async () => {
    const ctx = makeCtx();
    const { passed } = await evaluateAllAssertions(
      [
        { type: "contains", value: "Paris" },
        { type: "not_contains", value: "London" },
      ],
      ctx,
    );
    expect(passed).toBe(true);
  });

  it("returns score 0 for empty assertion list", async () => {
    const { score, passed } = await evaluateAllAssertions([], makeCtx());
    expect(score).toBe(0);
    expect(passed).toBe(true); // vacuously true
  });

  it("does not throw when one assertion errors internally", async () => {
    // Provide an assertion that triggers the catch path (bad regex)
    const { results } = await evaluateAllAssertions(
      [{ type: "regex", value: "([bad" }],
      makeCtx(),
    );
    expect(results[0].passed).toBe(false);
    expect(results[0].score).toBe(0);
  });
});
