import { describe, it, expect, vi, beforeEach } from "vitest";
import { cosineSimilarity, evaluateSemanticSimilarity } from "../semantic";

// ─── Mock AI embedding ────────────────────────────────────────────────────────

const mockEmbed = vi.fn();

vi.mock("ai", () => ({
  embed: (...args: unknown[]) => mockEmbed(...args),
}));

vi.mock("@/lib/ai", () => ({
  getEmbeddingModel: vi.fn().mockReturnValue("mock-embedding-model"),
}));

// ─── cosineSimilarity ─────────────────────────────────────────────────────────

describe("cosineSimilarity", () => {
  it("returns 1.0 for identical vectors", () => {
    const v = [0.5, 0.3, 0.8, 0.1];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  it("returns 0.0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0);
  });

  it("returns 0.0 for zero vector (no divide by zero)", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it("clamps negative similarity to 0", () => {
    // Anti-parallel vectors have cosine = -1, should clamp to 0
    const result = cosineSimilarity([1, 0], [-1, 0]);
    expect(result).toBe(0);
  });

  it("returns 0 for mismatched lengths", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it("returns 0 for empty arrays", () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it("computes partial similarity correctly", () => {
    // [1,1,0,0] and [1,0,1,0] → dot=1, norms=√2 each → cos=0.5
    const sim = cosineSimilarity([1, 1, 0, 0], [1, 0, 1, 0]);
    expect(sim).toBeCloseTo(0.5);
  });

  it("handles large vectors without overflow", () => {
    const a = Array(1536).fill(0.1);
    const b = Array(1536).fill(0.1);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0);
  });
});

// ─── evaluateSemanticSimilarity ───────────────────────────────────────────────

describe("evaluateSemanticSimilarity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes when similarity meets threshold", async () => {
    // Both texts get high-similarity embeddings
    mockEmbed
      .mockResolvedValueOnce({ embedding: [0.9, 0.1, 0.4] }) // output
      .mockResolvedValueOnce({ embedding: [0.85, 0.15, 0.38] }); // reference

    const result = await evaluateSemanticSimilarity(
      "The capital of France is Paris.",
      "Paris is the capital city of France.",
      0.8,
    );

    expect(result.type).toBe("semantic_similarity");
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.8);
    expect(result.message).toContain("meets threshold");
  });

  it("fails when similarity is below threshold", async () => {
    // Orthogonal embeddings → similarity ≈ 0
    mockEmbed
      .mockResolvedValueOnce({ embedding: [1, 0, 0] })
      .mockResolvedValueOnce({ embedding: [0, 1, 0] });

    const result = await evaluateSemanticSimilarity(
      "Paris",
      "banana",
      0.8,
    );

    expect(result.passed).toBe(false);
    expect(result.score).toBeCloseTo(0);
    expect(result.message).toContain("below threshold");
  });

  it("calls embed twice — once for output, once for reference", async () => {
    mockEmbed
      .mockResolvedValueOnce({ embedding: [1, 0] })
      .mockResolvedValueOnce({ embedding: [1, 0] });

    await evaluateSemanticSimilarity("output text", "reference text", 0.8);

    expect(mockEmbed).toHaveBeenCalledTimes(2);
  });

  it("returns failed result for empty output", async () => {
    const result = await evaluateSemanticSimilarity("", "some reference", 0.8);

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.message).toMatch(/empty/i);
    // Should not call embed at all
    expect(mockEmbed).not.toHaveBeenCalled();
  });

  it("includes similarity and threshold in details", async () => {
    mockEmbed
      .mockResolvedValueOnce({ embedding: [1, 0] })
      .mockResolvedValueOnce({ embedding: [1, 0] });

    const result = await evaluateSemanticSimilarity("hello", "hello", 0.9);

    expect(result.details).toMatchObject({
      similarity: expect.any(Number),
      threshold: 0.9,
    });
  });

  it("passes with threshold 0.0 (any non-empty output passes)", async () => {
    mockEmbed
      .mockResolvedValueOnce({ embedding: [1, 0] })
      .mockResolvedValueOnce({ embedding: [0, 1] });

    // orthogonal → similarity 0, but threshold is 0 so still passes
    const result = await evaluateSemanticSimilarity("unrelated", "completely different", 0.0);

    expect(result.passed).toBe(true);
  });

  it("uses both embeddings (not just one)", async () => {
    // Different embeddings for output vs reference
    mockEmbed
      .mockResolvedValueOnce({ embedding: [1, 0, 0] })  // output
      .mockResolvedValueOnce({ embedding: [0, 0, 1] }); // reference — orthogonal

    const result = await evaluateSemanticSimilarity("abc", "xyz", 0.5);
    expect(result.score).toBeCloseTo(0); // orthogonal → 0
    expect(result.passed).toBe(false);
  });
});
