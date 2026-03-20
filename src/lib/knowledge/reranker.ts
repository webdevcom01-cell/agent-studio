import { generateText } from "ai";
import { getModel } from "@/lib/ai";
import { logger } from "@/lib/logger";
import type { SearchResult } from "./search";

const COHERE_API_URL = "https://api.cohere.com/v2/rerank";
const COHERE_MODEL = "rerank-v3.5";
const COHERE_TIMEOUT_MS = 5_000;
const MAX_RERANK_CANDIDATES = 20;

// ── Cohere Rerank ────────────────────────────────────────────────────────

interface CohereRerankResult {
  index: number;
  relevance_score: number;
}

export async function cohereRerank(
  query: string,
  candidates: SearchResult[],
  topK: number = 5
): Promise<SearchResult[]> {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) {
    logger.warn("COHERE_API_KEY not set, skipping Cohere rerank");
    return candidates.slice(0, topK);
  }

  if (candidates.length === 0) return [];
  if (candidates.length <= topK) return candidates;

  const toRerank = candidates.slice(0, MAX_RERANK_CANDIDATES);

  try {
    const response = await fetch(COHERE_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: COHERE_MODEL,
        query,
        documents: toRerank.map((r) => r.content),
        top_n: topK,
        return_documents: false,
      }),
      signal: AbortSignal.timeout(COHERE_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      logger.warn("Cohere rerank API error", {
        status: response.status,
        error: errorText.slice(0, 200),
      });
      return candidates.slice(0, topK);
    }

    const data = (await response.json()) as { results?: CohereRerankResult[] };
    const rerankResults = data.results ?? [];

    const reranked: SearchResult[] = rerankResults
      .filter((r) => r.index >= 0 && r.index < toRerank.length)
      .map((r) => ({
        ...toRerank[r.index],
        relevanceScore: r.relevance_score,
      }));

    return reranked.slice(0, topK);
  } catch (err) {
    logger.warn("Cohere rerank failed, using original order", {
      error: err instanceof Error ? err.message : String(err),
    });
    return candidates.slice(0, topK);
  }
}

// ── LLM Rerank (existing) ────────────────────────────────────────────────

async function llmRerank(
  query: string,
  candidates: SearchResult[],
  topK: number = 5,
  modelId: string = "deepseek-chat"
): Promise<SearchResult[]> {
  if (candidates.length === 0) return [];
  if (candidates.length <= topK) return candidates;

  const toRerank = candidates.slice(0, MAX_RERANK_CANDIDATES);

  const candidateList = toRerank
    .map((c, i) => `[${i}] ${c.content.slice(0, 500)}${c.content.length > 500 ? "..." : ""}`)
    .join("\n\n");

  const prompt = `Score each passage for relevance to the query (0.0-1.0).

Query: "${query}"

Passages:
${candidateList}

Respond with ONLY a JSON array: [{"index": 0, "score": 0.95}, ...]`;

  try {
    const model = getModel(modelId);
    const { text } = await generateText({ model, prompt, temperature: 0, maxOutputTokens: 1000 });

    const scores = parseScoringResponse(text, toRerank.length);

    const scored = toRerank.map((candidate, i) => ({
      ...candidate,
      relevanceScore: scores[i] ?? candidate.relevanceScore ?? 0,
    }));

    scored.sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));
    return scored.slice(0, topK);
  } catch (error) {
    logger.error("LLM re-ranking failed", error);
    return candidates.slice(0, topK);
  }
}

function parseScoringResponse(text: string, expectedCount: number): number[] {
  const fallback = Array.from({ length: expectedCount }, (_, i) => 1 - i / expectedCount);

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return fallback;

    const parsed: unknown = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return fallback;

    const scores = new Array<number>(expectedCount).fill(0);

    for (const item of parsed) {
      if (typeof item === "object" && item !== null && "index" in item && "score" in item) {
        const idx = Number((item as { index: number }).index);
        const score = Number((item as { score: number }).score);
        if (idx >= 0 && idx < expectedCount && isFinite(score)) {
          scores[idx] = Math.max(0, Math.min(1, score));
        }
      }
    }

    return scores;
  } catch {
    return fallback;
  }
}

// ── Dispatcher ───────────────────────────────────────────────────────────

export async function rerankResults(
  query: string,
  candidates: SearchResult[],
  topK: number = 5,
  model?: string
): Promise<SearchResult[]> {
  switch (model) {
    case "cohere":
      return cohereRerank(query, candidates, topK);
    case "none":
      return candidates.slice(0, topK);
    case "llm-rubric":
    default:
      return llmRerank(query, candidates, topK);
  }
}
