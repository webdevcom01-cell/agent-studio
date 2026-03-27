/**
 * Query transformation strategies for improved RAG retrieval.
 *
 * - HyDE: Generate a hypothetical document passage, embed that instead of the query
 * - Multi-Query: Expand a single query into multiple phrasings for broader recall
 */

import { generateText } from "ai";
import { getModel } from "@/lib/ai";
import { logger } from "@/lib/logger";

const TRANSFORM_MODEL = "deepseek-chat";
const MAX_EXPANDED_QUERIES = 3;

export async function hydeTransform(
  query: string,
  context?: string,
  kbConfig?: { embeddingModel?: string | null },
): Promise<string> {
  try {
    const userPrompt = context ? `${query}\n\nContext: ${context}` : query;

    // Use a model compatible with the KB's embedding strategy.
    // OpenAI-embedded KBs pair well with GPT-family for HyDE; others use deepseek-chat.
    const hydeModel =
      kbConfig?.embeddingModel?.toLowerCase().includes("openai") ||
      kbConfig?.embeddingModel?.toLowerCase().includes("text-embedding")
        ? "gpt-4o-mini"
        : TRANSFORM_MODEL;

    const { text } = await generateText({
      model: getModel(hydeModel),
      system:
        "You are a helpful assistant. Given a user question, write a short hypothetical document passage (2-3 sentences) that would directly answer this question. Write ONLY the passage content, no preamble.",
      prompt: userPrompt,
      maxOutputTokens: 200,
      temperature: 0.7,
    });

    return text.trim() || query;
  } catch (err) {
    logger.warn("HyDE transform failed, using original query", {
      error: err instanceof Error ? err.message : String(err),
    });
    return query;
  }
}

export async function multiQueryExpand(query: string): Promise<string[]> {
  try {
    const { text } = await generateText({
      model: getModel(TRANSFORM_MODEL),
      system:
        "Given a search query, generate 3 alternative phrasings that capture different aspects or interpretations of the same information need. Return ONLY the 3 queries, one per line, no numbering or bullets.",
      prompt: query,
      maxOutputTokens: 200,
      temperature: 0.8,
    });

    const expanded = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, MAX_EXPANDED_QUERIES);

    // Deduplicate: remove any expanded query that matches the original (case-insensitive)
    const uniqueExpanded = expanded.filter(
      (q) => q.toLowerCase() !== query.toLowerCase(),
    );

    return [query, ...new Set(uniqueExpanded)];
  } catch (err) {
    logger.warn("Multi-query expansion failed, using original query", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [query];
  }
}

export interface TransformResult {
  queries: string[];
  hydeDocument?: string;
}

export async function transformQuery(
  query: string,
  mode: "none" | "hyde" | "multi_query"
): Promise<TransformResult> {
  switch (mode) {
    case "hyde": {
      const hydeDocument = await hydeTransform(query);
      return { queries: [query], hydeDocument };
    }
    case "multi_query": {
      const queries = await multiQueryExpand(query);
      return { queries };
    }
    default:
      return { queries: [query] };
  }
}
