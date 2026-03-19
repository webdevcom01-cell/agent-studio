# PLAN: RAG Pipeline Improvements

## Current State Summary

| Component | File | Current Behavior |
|-----------|------|-----------------|
| Chunking | `src/lib/knowledge/chunker.ts` | 400 tokens max, 20% overlap already implemented |
| Embeddings | `src/lib/knowledge/embeddings.ts` | OpenAI text-embedding-3-small, batch 100 |
| Search | `src/lib/knowledge/search.ts` | Hybrid (semantic + BM25), RRF fusion, optional LLM re-rank |
| KB Handler | `src/lib/runtime/handlers/kb-search-handler.ts` | Fixed topK from node config, passes results as `kb_context` |
| Ingest | `src/lib/knowledge/ingest.ts` | Chunks text, generates embeddings, stores with index metadata |

---

## Improvement 1: Parent Document Retrieval

### Problem
When a user's query matches a small chunk, the AI only sees that 400-token chunk. Often the surrounding context (previous/next chunks from the same source) contains critical information needed for a complete answer.

### Current Code (`kb-search-handler.ts:42`)
```ts
const kbContext = results.map((r) => r.content).join("\n---\n");
```
Just concatenates matched chunks. No surrounding context.

### Proposed Change
After search returns matched chunks, fetch their neighboring chunks (prev + next) from the same source using the `metadata.index` field. Merge into a "parent context" per source document.

**File: `src/lib/knowledge/search.ts`** — add new function:

```ts
export async function expandChunksWithContext(
  results: SearchResult[],
  contextWindow: number = 1
): Promise<SearchResult[]> {
  // For each result that has chunkIndex metadata:
  // 1. Query DB for chunks from same sourceId where index is within ±contextWindow
  // 2. Merge content in order (prev + match + next)
  // 3. Deduplicate overlapping expansions from same source
  // Return expanded results with combined content
}
```

**File: `src/lib/runtime/handlers/kb-search-handler.ts`** — call `expandChunksWithContext` after `hybridSearch`:

```ts
const results = await hybridSearch(query, kb.id, { topK });
const expanded = await expandChunksWithContext(results, 1);
const kbContext = expanded.map((r) => r.content).join("\n---\n");
```

### Impact
- **High** — This is the #1 reason RAG answers are incomplete. Adjacent chunks often contain the rest of the answer.
- DB cost: 1 additional query per search (batch fetch neighbors).
- Token cost: ~1.5-2x more context per result, but AI gets better answers.

---

## Improvement 2: Weighted RRF Scoring (Semantic 70% / Keyword 30%)

### Problem
Current default is 50/50 weighting between semantic and keyword search in RRF. Semantic search is generally more accurate for natural language questions, while keyword search is better for exact terms. A 70/30 split better reflects this.

### Current Code (`search.ts:163-168`)
```ts
const {
  topK = 5,
  semanticWeight = 0.5,
  keywordWeight = 0.5,
  rerank = false,
} = options ?? {};
```

### Proposed Change
Change defaults only — no structural change:

```ts
const {
  topK = 5,
  semanticWeight = 0.7,
  keywordWeight = 0.3,
  rerank = false,
} = options ?? {};
```

### Impact
- **Medium** — Improves ranking for natural language queries. Keyword-heavy queries (exact product names, error codes) slightly deprioritized but still contribute.
- Zero performance cost — same computation, different weights.
- The `HybridSearchOptions` interface already supports custom weights, so callers can override if needed.

---

## Improvement 3: Dynamic Top-K Based on Query Length

### Problem
Fixed `topK = 5` regardless of query complexity. Short queries ("pricing") need fewer, more precise results. Long queries ("how do I set up a KB search node that loops back to capture") need more context to cover all aspects.

### Current Code (`kb-search-handler.ts:7`)
```ts
const topK = (node.data.topK as number) ?? 5;
```

### Proposed Change
Add a `computeTopK` function that adjusts based on query word count, while respecting the node's configured topK as the upper bound.

**File: `src/lib/knowledge/search.ts`** — add helper:

```ts
export function computeDynamicTopK(query: string, configuredTopK: number): number {
  const wordCount = query.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 3) return Math.min(3, configuredTopK);
  if (wordCount <= 8) return Math.min(5, configuredTopK);
  return Math.min(7, configuredTopK);
}
```

**File: `src/lib/runtime/handlers/kb-search-handler.ts`** — use it:

```ts
const configuredTopK = (node.data.topK as number) ?? 7;  // raise default ceiling
const topK = computeDynamicTopK(query, configuredTopK);
const results = await hybridSearch(query, kb.id, { topK });
```

### Impact
- **Medium** — Reduces noise for short queries (fewer irrelevant chunks), provides more coverage for complex queries.
- Performance: fewer embeddings comparisons for short queries = slightly faster.
- The node picker default for KB Search should be updated from `topK: 5` to `topK: 7`.

---

## Improvement 4: Chunk Overlap

### Current Code — Already Implemented!

The chunker (`src/lib/knowledge/chunker.ts:49-63`) already has 20% overlap:

```ts
const overlapPercent = options?.overlapPercent ?? 0.2;
// ...
const overlapTokens = Math.floor(maxTokens * overlapPercent);
const overlappedChunks: string[] = [chunks[0]];

for (let i = 1; i < chunks.length; i++) {
  const prevWords = chunks[i - 1].split(/\s+/);
  const overlapWordCount = Math.floor(overlapTokens * 0.75);
  const overlapText = prevWords.slice(-overlapWordCount).join(" ");
  const combined = `${overlapText} ${chunks[i]}`.trim();
  // ...
}
```

**No changes needed.** The 20% overlap is already built into the chunking pipeline and is applied to all ingested sources. This was confirmed by reading the code and the existing test suite (`chunker.test.ts` has 11 tests).

---

## Implementation Order

| Step | Improvement | Files Changed | Complexity |
|------|-----------|---------------|-----------|
| 1 | Weighted RRF (70/30) | `search.ts` | Trivial — change 2 default values |
| 2 | Dynamic top-K | `search.ts`, `kb-search-handler.ts`, `node-picker.tsx` | Low — add 1 function, update 2 lines |
| 3 | Parent document retrieval | `search.ts`, `kb-search-handler.ts` | Medium — new DB query, dedup logic |

Step 4 (chunk overlap) is already done — no work needed.

## Verification

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] All 110 existing tests pass
- [ ] New tests for `computeDynamicTopK` function
- [ ] New tests for `expandChunksWithContext` function
- [ ] Manual test: short query returns 3 results, long query returns 7
- [ ] Manual test: expanded context includes adjacent chunks
- [ ] Build succeeds
