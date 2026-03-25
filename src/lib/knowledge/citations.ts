/**
 * Citation tracking for Knowledge Base search results.
 *
 * Extracts, deduplicates, and formats citations from search results
 * for both AI context injection and frontend display.
 */

import type { SearchResult } from "./search";

const MAX_CITATIONS = 5;
const MAX_SNIPPET_LENGTH = 200;

export interface Citation {
  sourceId: string;
  sourceName: string;
  chunkId: string;
  content: string;
  relevanceScore: number;
  pageNumber?: number;
  sectionHeader?: string;
}

/**
 * Converts search results into deduplicated citations.
 * Keeps the highest-scoring chunk per source, max 5 citations.
 */
export function extractCitations(searchResults: SearchResult[]): Citation[] {
  if (searchResults.length === 0) return [];

  const bySource = new Map<string, Citation>();

  for (const result of searchResults) {
    const sourceId = result.sourceId;
    const existing = bySource.get(sourceId);

    if (!existing || result.relevanceScore > existing.relevanceScore) {
      const snippet = result.content.length > MAX_SNIPPET_LENGTH
        ? result.content.slice(0, MAX_SNIPPET_LENGTH) + "..."
        : result.content;

      bySource.set(sourceId, {
        sourceId,
        sourceName: result.sourceDocument ?? "Unknown source",
        chunkId: result.chunkId,
        content: snippet,
        relevanceScore: result.relevanceScore,
        pageNumber: result.pageNumber,
        sectionHeader: result.metadata?.sectionHeader as string | undefined,
      });
    }
  }

  return Array.from(bySource.values())
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, MAX_CITATIONS);
}

/**
 * Formats citations as a string for AI context injection.
 * Appended to system prompt or as a separate context message.
 */
export function formatCitationsForAI(citations: Citation[]): string {
  if (citations.length === 0) return "";

  const lines = citations.map((c, i) => {
    const parts = [`[${i + 1}] ${c.sourceName}`];
    if (c.pageNumber !== undefined) parts.push(`(p.${c.pageNumber})`);
    parts.push(`(score: ${c.relevanceScore.toFixed(2)})`);
    parts.push(`: ${c.content}`);
    return parts.join(" ");
  });

  return `\n\nSources used:\n${lines.join("\n")}`;
}

/**
 * Formats citations for frontend display.
 */
export function formatCitationsForUI(
  citations: Citation[]
): { id: string; source: string; snippet: string; page?: number }[] {
  return citations.map((c) => ({
    id: c.chunkId,
    source: c.sourceName,
    snippet: c.content,
    page: c.pageNumber,
  }));
}
