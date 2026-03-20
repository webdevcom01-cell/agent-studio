/**
 * Context ordering and compression for RAG retrieval results.
 *
 * "Lost in the Middle" (Liu et al. 2023): LLMs best use information at the
 * START and END of context, ignoring the middle. Optimal ordering places the
 * most relevant chunks at positions 1 and last.
 */

import { countTokens } from "./chunker";
import type { SearchResult } from "./search";

export type ContextOrderingStrategy =
  | "relevance"
  | "lost_in_middle"
  | "chronological"
  | "diversity";

/**
 * Sort by relevanceScore descending (default, already the standard order).
 */
export function orderByRelevance(results: SearchResult[]): SearchResult[] {
  return [...results].sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/**
 * "Lost in the Middle" ordering: most relevant chunks at positions 1 and last.
 * Creates a U-shaped relevance curve — high at edges, low in the middle.
 */
export function orderLostInMiddle(results: SearchResult[]): SearchResult[] {
  if (results.length <= 2) return results;

  const sorted = [...results].sort((a, b) => b.relevanceScore - a.relevanceScore);
  const ordered: SearchResult[] = new Array(sorted.length);
  let left = 0;
  let right = sorted.length - 1;

  for (let i = 0; i < sorted.length; i++) {
    if (i % 2 === 0) {
      ordered[left] = sorted[i];
      left++;
    } else {
      ordered[right] = sorted[i];
      right--;
    }
  }

  return ordered;
}

/**
 * Chronological ordering by chunkIndex, then by sourceDocument.
 * Useful for sequential documents (tutorials, step-by-step guides).
 */
export function orderChronological(results: SearchResult[]): SearchResult[] {
  return [...results].sort((a, b) => {
    const docA = a.sourceDocument ?? "";
    const docB = b.sourceDocument ?? "";
    if (docA !== docB) return docA.localeCompare(docB);
    return (a.chunkIndex ?? 0) - (b.chunkIndex ?? 0);
  });
}

/**
 * Diversity-based ordering using MMR-like selection.
 * Iteratively picks the most relevant chunk that is also most different
 * from already selected chunks, reducing redundancy.
 */
export function orderByDiversity(results: SearchResult[]): SearchResult[] {
  if (results.length <= 1) return results;

  const diversityPenalty = 0.3;
  const selected: SearchResult[] = [];
  const remaining = [...results];

  // First pick: highest relevance
  remaining.sort((a, b) => b.relevanceScore - a.relevanceScore);
  selected.push(remaining.shift()!);

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      const candidateTokens = tokenize(candidate.content);

      let maxSim = 0;
      for (const sel of selected) {
        const sim = jaccardSimilarity(candidateTokens, tokenize(sel.content));
        if (sim > maxSim) maxSim = sim;
      }

      const diverseScore = candidate.relevanceScore * (1 - maxSim * diversityPenalty);
      if (diverseScore > bestScore) {
        bestScore = diverseScore;
        bestIdx = i;
      }
    }

    selected.push(remaining.splice(bestIdx, 1)[0]);
  }

  return selected;
}

/**
 * Dispatcher: apply the specified ordering strategy.
 */
export function orderContext(
  results: SearchResult[],
  strategy: ContextOrderingStrategy
): SearchResult[] {
  switch (strategy) {
    case "lost_in_middle":
      return orderLostInMiddle(results);
    case "chronological":
      return orderChronological(results);
    case "diversity":
      return orderByDiversity(results);
    case "relevance":
    default:
      return orderByRelevance(results);
  }
}

/**
 * Compress context to fit within a token budget.
 * Iteratively adds chunks until maxTokens is reached.
 * Truncates the last chunk if it would exceed the budget.
 */
export function compressContext(
  results: SearchResult[],
  maxTokens: number
): SearchResult[] {
  if (results.length === 0) return [];

  const compressed: SearchResult[] = [];
  let usedTokens = 0;

  for (const result of results) {
    const tokens = countTokens(result.content);

    if (usedTokens + tokens <= maxTokens) {
      compressed.push(result);
      usedTokens += tokens;
    } else {
      const remaining = maxTokens - usedTokens;
      if (remaining > 20) {
        const words = result.content.split(/\s+/);
        let truncated = "";
        for (const word of words) {
          const candidate = truncated ? `${truncated} ${word}` : word;
          if (countTokens(candidate) > remaining) break;
          truncated = candidate;
        }
        if (truncated) {
          compressed.push({ ...result, content: truncated });
        }
      }
      break;
    }
  }

  return compressed;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean)
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
