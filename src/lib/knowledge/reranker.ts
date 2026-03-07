import { generateText } from "ai";
import { getModel } from "@/lib/ai";
import { logger } from "@/lib/logger";
import type { SearchResult } from "./search";

export async function rerankResults(
  query: string,
  candidates: SearchResult[],
  topK: number = 5,
  modelId: string = "deepseek-chat"
): Promise<SearchResult[]> {
  if (candidates.length === 0) return [];
  if (candidates.length <= topK) return candidates;

  const toRerank = candidates.slice(0, 20);

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
