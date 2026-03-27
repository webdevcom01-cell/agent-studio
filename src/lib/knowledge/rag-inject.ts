/**
 * RAG (Retrieval-Augmented Generation) context injection helper.
 *
 * Looks up the Knowledge Base for an agent, runs hybrid search with the user's
 * query (optionally reformulated from conversation history), and returns an
 * augmented system prompt with retrieved context wrapped in XML tags.
 */

import { prisma } from "@/lib/prisma";
import { hybridSearch, computeDynamicTopK, expandChunksWithContext, sanitizeChunkContent } from "./search";
import type { SearchResult } from "./search";
import { extractCitations, formatCitationsForAI } from "./citations";
import { trackKBSearch } from "@/lib/analytics";
import { logger } from "@/lib/logger";
import { shouldRetrieve } from "./agentic-retrieval";
import { classifyQuery, getSearchConfigForQueryType } from "./query-router";

export interface RAGInjectionResult {
  augmentedSystemPrompt: string;
  /** How many chunks were retrieved (0 = no KB or no results). */
  retrievedChunkCount: number;
  /** Wall-clock time for the retrieval step in milliseconds. */
  retrievalTimeMs: number;
  /** The knowledge base ID used, or null if agent has no KB. */
  knowledgeBaseId: string | null;
  /** Raw retrieved chunks — exposed so callers can run grounding check post-generation. */
  retrievedChunks: SearchResult[];
  /** Machine-readable reason for skipping retrieval (undefined = retrieval was attempted). */
  skippedReason?: string;
}

export interface RAGInjectionOptions {
  /** Max chunks to retrieve. Defaults to dynamic topK based on query length. */
  topK?: number;
  /** Expand each result with surrounding chunks for richer context. Default: 1 neighbour. */
  contextWindowSize?: number;
  /** Skip RAG even if KB exists — allows per-node opt-out. */
  disabled?: boolean;
}

/**
 * Injects retrieved KB context into the system prompt.
 *
 * Usage in a node handler:
 * ```ts
 * const { augmentedSystemPrompt } = await injectRAGContext(
 *   context.agentId, systemPrompt, latestUserMessage, context.conversationId,
 * );
 * ```
 */
export async function injectRAGContext(
  agentId: string,
  systemPrompt: string,
  userQuery: string,
  conversationId: string,
  options: RAGInjectionOptions = {},
): Promise<RAGInjectionResult> {
  const noResult: RAGInjectionResult = {
    augmentedSystemPrompt: systemPrompt,
    retrievedChunkCount: 0,
    retrievalTimeMs: 0,
    knowledgeBaseId: null,
    retrievedChunks: [],
  };

  if (options.disabled) return noResult;
  if (!userQuery.trim()) return noResult;

  // ── 1. Look up KB for this agent ────────────────────────────────────────────
  let kbId: string;
  let hasKB = false;
  try {
    const kb = await prisma.knowledgeBase.findUnique({
      where: { agentId },
      select: { id: true, _count: { select: { sources: { where: { status: "READY" } } } } },
    });
    if (!kb || kb._count.sources === 0) return { ...noResult, knowledgeBaseId: kb?.id ?? null };
    kbId = kb.id;
    hasKB = true;
  } catch (err) {
    logger.warn("RAG inject: KB lookup failed", {
      agentId,
      error: err instanceof Error ? err.message : String(err),
    });
    return noResult;
  }

  // ── 1b. Agentic retrieval decision — skip for greetings / trivial queries ───
  const retrievalDecision = shouldRetrieve(userQuery, hasKB);
  if (!retrievalDecision.retrieve) {
    return { ...noResult, knowledgeBaseId: kbId, skippedReason: retrievalDecision.reason };
  }

  // ── 1c. Adaptive query routing — pick topK / rerank based on query type ─────
  const queryType = classifyQuery(userQuery);
  const queryConfig = getSearchConfigForQueryType(queryType);

  const start = Date.now();

  // ── 2. Hybrid search ────────────────────────────────────────────────────────
  let results;
  try {
    const topK = options.topK ?? queryConfig.topK ?? computeDynamicTopK(userQuery, 5);
    results = await hybridSearch(userQuery, kbId, { topK });
    if (results.length === 0) return { ...noResult, knowledgeBaseId: kbId };

    // Expand with neighbouring chunks for richer context
    const windowSize = options.contextWindowSize ?? 1;
    results = await expandChunksWithContext(results, windowSize);
  } catch (err) {
    logger.warn("RAG inject: hybrid search failed", {
      agentId,
      kbId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ...noResult, knowledgeBaseId: kbId };
  }

  const retrievalTimeMs = Date.now() - start;

  // ── 3. Fire-and-forget analytics ────────────────────────────────────────────
  trackKBSearch({
    agentId,
    conversationId,
    query: userQuery,
    resultCount: results.length,
    topScore: results.length > 0 ? results[0].relevanceScore : null,
  }).catch((err) => logger.warn("RAG inject: analytics tracking failed", err));

  // ── 4. Build augmented system prompt ────────────────────────────────────────
  const citations = extractCitations(results);
  const citationText = formatCitationsForAI(citations);

  // Sanitize each chunk to avoid HTML injection
  const chunksText = results
    .map((r, i) => `[${i + 1}] ${sanitizeChunkContent(r.content)}`)
    .join("\n\n");

  const augmentedSystemPrompt = `${systemPrompt}

<knowledge_base_context>
${chunksText}
${citationText}
</knowledge_base_context>

Use the knowledge base context above to answer accurately. Cite sources by number when applicable (e.g. [1], [2]).`;

  return {
    augmentedSystemPrompt,
    retrievedChunkCount: results.length,
    retrievalTimeMs,
    knowledgeBaseId: kbId,
    retrievedChunks: results,
  };
}
