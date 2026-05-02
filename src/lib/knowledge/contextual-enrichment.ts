/**
 * Anthropic Contextual Retrieval — prepend LLM-generated context to each chunk.
 *
 * Reference: https://www.anthropic.com/news/contextual-retrieval (Sep 2024)
 *
 * Problem: Chunks lose their place in the document after extraction.
 * "Prihodi su porasli za 23%" doesn't tell the retrieval system *whose* revenue,
 * *when*, or *in which section* it was discussed.
 *
 * Solution: For each chunk, call an LLM with the whole document + chunk and ask
 * for 2-3 sentences that situate the chunk within the document. Prepend that
 * context to the chunk content before embedding + BM25 indexing.
 *
 * Results (Anthropic benchmark):
 * - 49% fewer failed retrievals (vs raw chunking)
 * - 67% fewer failed retrievals when combined with reranking
 *
 * Cost (gpt-4.1-mini, 1000 chunks × ~300 input tokens):
 * - ~$0.02 per full KB re-ingest
 * - Use prompt caching (document prefix is identical for all chunks)
 *
 * Usage: enabled per-KB via `contextualEnrichment: true` in KB settings.
 * Disabled by default to preserve backward compatibility.
 */

import { generateText } from "ai";
import { getModel } from "@/lib/ai";
import { logger } from "@/lib/logger";

/** Max characters of the document to include in the context prompt. */
const MAX_DOC_PREVIEW_CHARS = 12_000;

/** Max concurrent LLM calls per batch (avoid rate limits). */
const DEFAULT_CONCURRENCY = 5;

/** Max tokens for the generated context snippet (2-3 sentences). */
const MAX_CONTEXT_TOKENS = 150;

/**
 * Situates each chunk within the source document via an LLM call.
 * Returns enriched chunk strings with context prepended.
 *
 * Gracefully falls back to the original chunk string on any LLM failure.
 *
 * @param chunks          - Plain text chunks from the chunker pipeline
 * @param documentContent - Full text of the source document (truncated internally)
 * @param options         - Optional: concurrency limit
 */
export async function enrichChunksWithContext(
  chunks: string[],
  documentContent: string,
  options?: { concurrency?: number },
): Promise<string[]> {
  if (chunks.length === 0) return chunks;

  const concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY;
  // Truncate document to keep the prompt manageable
  const docPreview = documentContent.slice(0, MAX_DOC_PREVIEW_CHARS);

  const enriched: string[] = [];

  // Process in batches to respect rate limits
  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch = chunks.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(async (chunk): Promise<string> => {
        try {
          const { text } = await generateText({
            model: getModel("gpt-4.1-mini"),
            prompt: buildContextPrompt(docPreview, chunk),
            maxOutputTokens: MAX_CONTEXT_TOKENS,
            temperature: 0,
          });

          const contextSnippet = text.trim();
          if (!contextSnippet) return chunk;

          return `${contextSnippet}\n\n${chunk}`;
        } catch (err) {
          // Graceful fallback — never block ingestion on enrichment failure
          logger.warn("Contextual enrichment failed for chunk, using original", {
            error: err instanceof Error ? err.message : String(err),
            chunkPreview: chunk.slice(0, 80),
          });
          return chunk;
        }
      }),
    );

    enriched.push(...batchResults);

    logger.info("Contextual enrichment batch complete", {
      batchIndex: Math.floor(i / concurrency) + 1,
      totalBatches: Math.ceil(chunks.length / concurrency),
      enrichedSoFar: enriched.length,
    });
  }

  return enriched;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function buildContextPrompt(documentPreview: string, chunkContent: string): string {
  return `<document>
${documentPreview}
</document>

Here is the chunk to situate within the document:
<chunk>
${chunkContent}
</chunk>

Write 2-3 sentences that place this chunk in context of the document above.
Mention key entities (company, product, time period, section) that help identify where this fits.
Output ONLY the context sentences — no introduction, no explanation.`;
}
