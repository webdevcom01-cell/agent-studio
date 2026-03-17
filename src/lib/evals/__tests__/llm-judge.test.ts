import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  evaluateLLMRubric,
  evaluateKBFaithfulness,
  evaluateRelevance,
} from "../llm-judge";

// ─── Mock AI ──────────────────────────────────────────────────────────────────

const mockGenerateObject = vi.fn();

vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

vi.mock("@/lib/ai", () => ({
  getModel: vi.fn().mockReturnValue("mock-model"),
  DEFAULT_MODEL: "deepseek-chat",
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockJudge(score: number, reasoning = "Test reasoning.") {
  mockGenerateObject.mockResolvedValueOnce({
    object: { score, reasoning },
  });
}

const INPUT = "What is the capital of France?";
const OUTPUT = "The capital of France is Paris.";

// ─── evaluateLLMRubric ────────────────────────────────────────────────────────

describe("evaluateLLMRubric", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes when judge score >= threshold", async () => {
    mockJudge(0.9, "Response is correct and complete.");
    const result = await evaluateLLMRubric(INPUT, OUTPUT, "Answer correctly.", 0.7);

    expect(result.type).toBe("llm_rubric");
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0.9);
    expect(result.message).toContain("meets threshold");
  });

  it("fails when judge score < threshold", async () => {
    mockJudge(0.4, "Response is incomplete.");
    const result = await evaluateLLMRubric(INPUT, OUTPUT, "Be comprehensive.", 0.7);

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0.4);
    expect(result.message).toContain("below threshold");
  });

  it("passes at exactly the threshold", async () => {
    mockJudge(0.7);
    const result = await evaluateLLMRubric(INPUT, OUTPUT, "Any rubric.", 0.7);
    expect(result.passed).toBe(true);
  });

  it("includes reasoning in details", async () => {
    mockJudge(0.8, "Very accurate response.");
    const result = await evaluateLLMRubric(INPUT, OUTPUT, "Be accurate.", 0.7);

    expect(result.details).toMatchObject({
      reasoning: "Very accurate response.",
      rubric: "Be accurate.",
      threshold: 0.7,
    });
  });

  it("calls generateObject exactly once", async () => {
    mockJudge(0.8);
    await evaluateLLMRubric(INPUT, OUTPUT, "rubric", 0.7);
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
  });

  it("includes rubric in the AI call prompt", async () => {
    mockJudge(0.9);
    const rubric = "Must mention the Eiffel Tower.";
    await evaluateLLMRubric(INPUT, OUTPUT, rubric, 0.7);

    const callArgs = mockGenerateObject.mock.calls[0][0] as Record<string, unknown>;
    expect(String(callArgs.prompt)).toContain(rubric);
  });
});

// ─── evaluateKBFaithfulness ───────────────────────────────────────────────────

describe("evaluateKBFaithfulness", () => {
  beforeEach(() => vi.clearAllMocks());

  const KB_CONTEXT = "France is a country in Western Europe. Its capital is Paris.";

  it("passes when faithfulness score >= threshold", async () => {
    mockJudge(0.95, "All claims are grounded in context.");
    const result = await evaluateKBFaithfulness(INPUT, OUTPUT, KB_CONTEXT, 0.7);

    expect(result.type).toBe("kb_faithfulness");
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0.95);
  });

  it("fails when faithfulness score < threshold", async () => {
    mockJudge(0.3, "Response introduces facts not in context.");
    const result = await evaluateKBFaithfulness(INPUT, OUTPUT, KB_CONTEXT, 0.7);

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0.3);
  });

  it("returns failed result when no KB context is provided", async () => {
    const result = await evaluateKBFaithfulness(INPUT, OUTPUT, undefined, 0.7);

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.message).toMatch(/no context/i);
    // Should not call AI at all
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  it("returns failed result for empty KB context string", async () => {
    const result = await evaluateKBFaithfulness(INPUT, OUTPUT, "   ", 0.7);

    expect(result.passed).toBe(false);
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  it("passes KB context to the AI prompt", async () => {
    mockJudge(0.9);
    await evaluateKBFaithfulness(INPUT, OUTPUT, KB_CONTEXT, 0.7);

    const callArgs = mockGenerateObject.mock.calls[0][0] as Record<string, unknown>;
    expect(String(callArgs.prompt)).toContain(KB_CONTEXT);
  });

  it("includes reasoning in details", async () => {
    mockJudge(0.85, "Response is well-grounded.");
    const result = await evaluateKBFaithfulness(INPUT, OUTPUT, KB_CONTEXT, 0.7);

    expect(result.details).toMatchObject({
      reasoning: "Response is well-grounded.",
      threshold: 0.7,
    });
  });
});

// ─── evaluateRelevance ────────────────────────────────────────────────────────

describe("evaluateRelevance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes when relevance score >= threshold", async () => {
    mockJudge(0.88, "Response directly answers the question.");
    const result = await evaluateRelevance(INPUT, OUTPUT, 0.7);

    expect(result.type).toBe("relevance");
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0.88);
    expect(result.message).toContain("meets threshold");
  });

  it("fails when relevance score < threshold", async () => {
    mockJudge(0.2, "Response is off-topic.");
    const result = await evaluateRelevance(
      INPUT,
      "The weather in Paris is nice.",
      0.7,
    );

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0.2);
    expect(result.message).toContain("below threshold");
  });

  it("passes at exactly the threshold", async () => {
    mockJudge(0.7);
    const result = await evaluateRelevance(INPUT, OUTPUT, 0.7);
    expect(result.passed).toBe(true);
  });

  it("calls generateObject once", async () => {
    mockJudge(0.9);
    await evaluateRelevance(INPUT, OUTPUT, 0.7);
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
  });

  it("passes both input and output to AI", async () => {
    mockJudge(0.9);
    await evaluateRelevance(INPUT, OUTPUT, 0.7);

    const callArgs = mockGenerateObject.mock.calls[0][0] as Record<string, unknown>;
    expect(String(callArgs.prompt)).toContain(INPUT);
    expect(String(callArgs.prompt)).toContain(OUTPUT);
  });

  it("includes reasoning in details", async () => {
    mockJudge(0.75, "Partially addresses the question.");
    const result = await evaluateRelevance(INPUT, OUTPUT, 0.7);

    expect(result.details).toMatchObject({
      reasoning: "Partially addresses the question.",
      threshold: 0.7,
    });
  });

  it("handles score of 0.0 (complete failure)", async () => {
    mockJudge(0.0, "Completely irrelevant.");
    const result = await evaluateRelevance("capital of France?", "I like apples.", 0.7);

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  it("handles score of 1.0 (perfect)", async () => {
    mockJudge(1.0, "Perfect response.");
    const result = await evaluateRelevance(INPUT, OUTPUT, 0.9);

    expect(result.passed).toBe(true);
    expect(result.score).toBe(1.0);
  });
});
