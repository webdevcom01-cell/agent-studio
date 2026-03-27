import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  evaluateRAGFaithfulness,
  evaluateRAGContextPrecision,
  evaluateRAGAnswerRelevancy,
} from "../rag-assertions";

// ── Mock Vercel AI SDK ─────────────────────────────────────────────────────

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({
  getModel: vi.fn(() => "mock-model"),
  DEFAULT_MODEL: "mock-model",
}));

import { generateObject } from "ai";

const mockGenerateObject = vi.mocked(generateObject);

function mockJudge(score: number, reasoning = "Test reasoning") {
  mockGenerateObject.mockResolvedValueOnce({
    object: { score, reasoning },
  } as never);
}

// ── evaluateRAGFaithfulness ────────────────────────────────────────────────

describe("evaluateRAGFaithfulness", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns failed result when kbContext is undefined", async () => {
    const result = await evaluateRAGFaithfulness("q", "answer", undefined, 0.7);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.type).toBe("rag_faithfulness");
    expect(result.message).toContain("requires KB context");
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  it("returns failed result when kbContext is empty string", async () => {
    const result = await evaluateRAGFaithfulness("q", "answer", "", 0.7);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  it("returns failed result when kbContext is whitespace only", async () => {
    const result = await evaluateRAGFaithfulness("q", "answer", "   ", 0.7);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  it("passes when score >= threshold", async () => {
    mockJudge(0.9);
    const result = await evaluateRAGFaithfulness("q", "answer", "context", 0.7);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0.9);
    expect(result.message).toContain("≥");
  });

  it("fails when score < threshold", async () => {
    mockJudge(0.5);
    const result = await evaluateRAGFaithfulness("q", "answer", "context", 0.7);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0.5);
    expect(result.message).toContain("<");
  });

  it("passes at exact threshold boundary", async () => {
    mockJudge(0.7);
    const result = await evaluateRAGFaithfulness("q", "answer", "context", 0.7);
    expect(result.passed).toBe(true);
  });

  it("includes reasoning in message and details", async () => {
    mockJudge(0.8, "All claims are supported by the retrieved chunks.");
    const result = await evaluateRAGFaithfulness("q", "answer", "context", 0.7);
    expect(result.message).toContain("All claims are supported");
    expect(result.details?.reasoning).toBe("All claims are supported by the retrieved chunks.");
  });

  it("includes threshold in details", async () => {
    mockJudge(0.8);
    const result = await evaluateRAGFaithfulness("q", "answer", "context", 0.75);
    expect(result.details?.threshold).toBe(0.75);
  });
});

// ── evaluateRAGContextPrecision ────────────────────────────────────────────

describe("evaluateRAGContextPrecision", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns failed result when kbContext is undefined", async () => {
    const result = await evaluateRAGContextPrecision("q", undefined, 0.7);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.type).toBe("rag_context_precision");
    expect(result.message).toContain("requires KB context");
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  it("returns failed result when kbContext is empty", async () => {
    const result = await evaluateRAGContextPrecision("q", "", 0.7);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  it("passes when score >= threshold", async () => {
    mockJudge(0.85);
    const result = await evaluateRAGContextPrecision("q", "context", 0.7);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0.85);
  });

  it("fails when score < threshold", async () => {
    mockJudge(0.4);
    const result = await evaluateRAGContextPrecision("q", "context", 0.7);
    expect(result.passed).toBe(false);
  });

  it("does NOT require output parameter — only input + kbContext", async () => {
    mockJudge(0.9);
    // evaluateRAGContextPrecision only takes (input, kbContext, threshold)
    const result = await evaluateRAGContextPrecision("question", "context", 0.5);
    expect(mockGenerateObject).toHaveBeenCalledOnce();
    expect(result.passed).toBe(true);
  });

  it("includes input in the judge prompt", async () => {
    mockJudge(0.8);
    await evaluateRAGContextPrecision("my specific question", "context", 0.7);
    const callArgs = mockGenerateObject.mock.calls[0][0] as { prompt: string };
    expect(callArgs.prompt).toContain("my specific question");
  });
});

// ── evaluateRAGAnswerRelevancy ─────────────────────────────────────────────

describe("evaluateRAGAnswerRelevancy", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes when score >= threshold", async () => {
    mockJudge(0.9);
    const result = await evaluateRAGAnswerRelevancy("q", "answer", 0.7);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0.9);
    expect(result.type).toBe("rag_answer_relevancy");
  });

  it("fails when score < threshold", async () => {
    mockJudge(0.3);
    const result = await evaluateRAGAnswerRelevancy("q", "answer", 0.7);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0.3);
  });

  it("does NOT require kbContext — evaluates answer against question only", async () => {
    mockJudge(0.95);
    // Should work without any kbContext
    const result = await evaluateRAGAnswerRelevancy("How do I reset my password?", "Click Forgot Password.", 0.7);
    expect(mockGenerateObject).toHaveBeenCalledOnce();
    expect(result.passed).toBe(true);
  });

  it("includes input and output in the judge prompt", async () => {
    mockJudge(0.8);
    await evaluateRAGAnswerRelevancy("my question here", "my answer here", 0.7);
    const callArgs = mockGenerateObject.mock.calls[0][0] as { prompt: string };
    expect(callArgs.prompt).toContain("my question here");
    expect(callArgs.prompt).toContain("my answer here");
  });

  it("passes at exact threshold boundary", async () => {
    mockJudge(0.7);
    const result = await evaluateRAGAnswerRelevancy("q", "a", 0.7);
    expect(result.passed).toBe(true);
  });

  it("returns score 0 boundary correctly for very low score", async () => {
    mockJudge(0.0);
    const result = await evaluateRAGAnswerRelevancy("q", "a", 0.7);
    expect(result.score).toBe(0.0);
    expect(result.passed).toBe(false);
  });

  it("message contains score formatted to 2 decimal places", async () => {
    mockJudge(0.85);
    const result = await evaluateRAGAnswerRelevancy("q", "a", 0.7);
    expect(result.message).toContain("0.85");
  });

  it("includes reasoning from judge in message", async () => {
    mockJudge(0.8, "Response directly addresses the question.");
    const result = await evaluateRAGAnswerRelevancy("q", "a", 0.7);
    expect(result.message).toContain("Response directly addresses the question.");
  });
});
