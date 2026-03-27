/**
 * Adaptive Query Router
 *
 * Classifies user queries into semantic categories and returns
 * optimal search configuration for each category.
 *
 * Categories (inspired by RAGAS + Anthropic RAG guidelines):
 *   factual       — short, specific lookups ("what is X")
 *   conversational — mid-length natural language questions
 *   analytical    — long, multi-faceted questions requiring synthesis
 *   multi-hop     — comparisons or questions requiring multiple context pieces
 */

export type QueryType = "factual" | "analytical" | "conversational" | "multi-hop";

export interface QuerySearchConfig {
  topK: number;
  rerankModel?: "none" | "llm-rubric" | "cohere";
  queryTransform?: "none" | "hyde" | "multi_query";
}

/** Patterns that suggest a multi-hop / comparison query. */
const MULTI_HOP_RE =
  /compare|razlika|vs\.|versus|između|difference|both|sve|a\s+što|as\s+well\s+as|and\s+also|a\s+takođe|kao\s+i/i;

/**
 * Classifies a query into one of four retrieval categories.
 * Pure function — no LLM call, <1 ms.
 */
export function classifyQuery(query: string): QueryType {
  const wordCount = query.trim().split(/\s+/).filter(Boolean).length;

  if (MULTI_HOP_RE.test(query)) return "multi-hop";
  if (wordCount <= 5) return "factual";
  if (wordCount <= 10) return "conversational";
  return "analytical";
}

/**
 * Returns optimal search configuration for a given query type.
 * Merges with per-KB defaults at call-site; these are sensible overrides.
 */
export function getSearchConfigForQueryType(type: QueryType): QuerySearchConfig {
  switch (type) {
    case "factual":
      // Short query → few chunks, skip reranking (fast path)
      return { topK: 3, rerankModel: "none" };

    case "conversational":
      // Standard RAG — balanced
      return { topK: 5, rerankModel: "none" };

    case "analytical":
      // Long query needs more context + reranking to surface best passages
      return { topK: 8, rerankModel: "llm-rubric" };

    case "multi-hop":
      // Comparison queries need broad retrieval + multi-query expansion
      return { topK: 10, queryTransform: "multi_query" };
  }
}
