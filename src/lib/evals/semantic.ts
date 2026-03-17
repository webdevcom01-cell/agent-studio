/**
 * Agent Evals — Semantic Similarity Evaluator (Layer 2)
 *
 * Uses OpenAI text-embedding-3-small (via getEmbeddingModel()) to compute
 * cosine similarity between the agent output and a reference text.
 *
 * Score:  1.0 → identical meaning
 *         0.8 → very similar (default passing threshold)
 *         0.5 → somewhat related
 *         0.0 → completely unrelated
 */

import { embed } from "ai";
import { getEmbeddingModel } from "@/lib/ai";
import type { AssertionResult } from "./schemas";

// ─── Cosine similarity ────────────────────────────────────────────────────────

/**
 * Compute cosine similarity between two embedding vectors.
 * Returns a value in [-1, 1] — clamped to [0, 1] for scoring purposes.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;

  // Clamp to [0, 1] — negative similarity is treated as 0 for scoring
  return Math.max(0, Math.min(1, dot / denom));
}

// ─── Embedding helper ─────────────────────────────────────────────────────────

async function getEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: getEmbeddingModel(),
    value: text,
  });
  return embedding;
}

// ─── Semantic similarity assertion ────────────────────────────────────────────

/**
 * Evaluate semantic similarity between agent output and a reference value.
 * Both texts are embedded and their cosine similarity is computed.
 * Passes if similarity >= threshold (default 0.8).
 */
export async function evaluateSemanticSimilarity(
  output: string,
  referenceValue: string,
  threshold: number,
): Promise<AssertionResult> {
  if (!output.trim()) {
    return {
      type: "semantic_similarity",
      passed: false,
      score: 0,
      message: "Agent output is empty — cannot compute semantic similarity.",
      details: { threshold },
    };
  }

  const [outputEmbedding, referenceEmbedding] = await Promise.all([
    getEmbedding(output),
    getEmbedding(referenceValue),
  ]);

  const similarity = cosineSimilarity(outputEmbedding, referenceEmbedding);
  const passed = similarity >= threshold;

  return {
    type: "semantic_similarity",
    passed,
    score: similarity,
    message: passed
      ? `Semantic similarity ${similarity.toFixed(3)} meets threshold ${threshold}.`
      : `Semantic similarity ${similarity.toFixed(3)} is below threshold ${threshold}.`,
    details: {
      similarity,
      threshold,
      referencePreview: referenceValue.slice(0, 100),
    },
  };
}
