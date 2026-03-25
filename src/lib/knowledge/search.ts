import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { generateEmbedding } from "./embeddings";
import { getCachedQueryEmbedding, setCachedQueryEmbedding } from "./embedding-cache";
import { transformQuery } from "./query-transform";
import { evaluateFilter } from "./metadata-filter";
import type { MetadataFilter } from "./metadata-filter";
import { estimateTokens } from "./chunker";
import { orderContext, compressContext } from "./context-ordering";
import type { ContextOrderingStrategy } from "./context-ordering";
import { updateChunkRetrievalStats } from "./maintenance";
import { logger } from "@/lib/logger";
import { recordMetric } from "@/lib/observability/metrics";

const DEFAULT_RELEVANCE_THRESHOLD = 0.1;

interface KBSearchConfig {
  searchTopK: number;
  searchThreshold: number;
  hybridAlpha: number;
  retrievalMode: string;
  rerankingModel: string;
  embeddingModel: string | null;
  queryTransform: string;
  contextOrdering: string | null;
}

async function loadKBConfig(knowledgeBaseId: string): Promise<KBSearchConfig | null> {
  try {
    const kb = await prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
      select: {
        searchTopK: true,
        searchThreshold: true,
        hybridAlpha: true,
        retrievalMode: true,
        rerankingModel: true,
        embeddingModel: true,
        queryTransform: true,
        contextOrdering: true,
      },
    });
    return kb;
  } catch {
    return null;
  }
}

/** Queries with fewer words than this threshold auto-enable reranking. */
const SHORT_QUERY_WORD_THRESHOLD = 5;
const MAX_CONTEXT_TOKENS = 4000;

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
};

const HTML_ESCAPE_RE = /[&<>"']/g;

export function sanitizeChunkContent(content: string): string {
  return content.replace(HTML_ESCAPE_RE, (ch) => HTML_ESCAPE_MAP[ch]);
}

export interface SearchResult {
  chunkId: string;
  content: string;
  similarity: number;
  sourceId: string;
  sourceDocument?: string;
  sourceType?: string;
  pageNumber?: number;
  chunkIndex?: number;
  relevanceScore: number;
  metadata?: Record<string, unknown>;
}

export interface HybridSearchOptions {
  topK?: number;
  semanticWeight?: number;
  keywordWeight?: number;
  /** Explicit rerank toggle. When undefined, auto-enables for short queries (< 5 words). */
  rerank?: boolean;
  /** A/B test variant ID for search quality experiments. Logged with results. */
  abTestVariant?: string;
  /** Filter results by metadata conditions on chunks and sources. */
  metadataFilter?: MetadataFilter;
}

interface VectorSearchRow {
  id: string;
  content: string;
  similarity: number;
  sourceId: string;
  sourceName: string;
  sourceType: string;
  metadata: string | Record<string, unknown> | null;
}

interface KeywordSearchRow {
  id: string;
  content: string;
  rank: number;
  sourceId: string;
  sourceName: string;
  sourceType: string;
  metadata: string | Record<string, unknown> | null;
}

function parseMetadata(metadata: string | Record<string, unknown> | null): Record<string, unknown> {
  if (!metadata) return {};
  if (typeof metadata === "string") {
    try { return JSON.parse(metadata) as Record<string, unknown>; } catch { return {}; }
  }
  return metadata;
}

export async function searchKnowledgeBase(
  knowledgeBaseId: string,
  query: string,
  topK: number = 5,
  embeddingModel?: string,
  queryOverride?: string
): Promise<SearchResult[]> {
  const textToEmbed = queryOverride ?? query;
  let queryEmbedding = await getCachedQueryEmbedding(textToEmbed);
  if (!queryEmbedding) {
    queryEmbedding = await generateEmbedding(textToEmbed, embeddingModel);
    setCachedQueryEmbedding(textToEmbed, queryEmbedding).catch(() => {});
  }
  if (!queryEmbedding.every(v => typeof v === 'number' && isFinite(v))) {
    throw new Error('Invalid embedding');
  }

  // SAFETY: vectorStr is constructed from generateEmbedding() output,
  // which is validated above (every element is a finite number).
  // Prisma.raw() is used because Prisma.sql doesn't support pgvector's
  // ::vector cast directly. No user input reaches vectorStr.
  const vectorStr = `[${queryEmbedding.join(",")}]`;

  const results = await prisma.$queryRaw<VectorSearchRow[]>(
    Prisma.sql`
      SELECT
        c."id", c."content",
        1 - (c."embedding" <=> ${vectorStr}::vector) as similarity,
        c."sourceId", s."name" as "sourceName", s."type" as "sourceType", c."metadata"
      FROM "KBChunk" c
      INNER JOIN "KBSource" s ON c."sourceId" = s."id"
      WHERE s."knowledgeBaseId" = ${knowledgeBaseId}
        AND s."status" = 'READY'
        AND c."embedding" IS NOT NULL
      ORDER BY c."embedding" <=> ${vectorStr}::vector
      LIMIT ${topK}
    `
  );

  return results.map((r) => {
    const meta = parseMetadata(r.metadata);
    return {
      chunkId: r.id,
      content: sanitizeChunkContent(r.content),
      similarity: Number(r.similarity),
      sourceId: r.sourceId,
      sourceDocument: r.sourceName ?? undefined,
      sourceType: r.sourceType ?? undefined,
      pageNumber: typeof meta.page === "number" ? meta.page : undefined,
      chunkIndex: typeof meta.index === "number" ? meta.index : undefined,
      relevanceScore: Number(r.similarity),
      metadata: meta,
    };
  });
}

async function keywordSearch(
  knowledgeBaseId: string,
  query: string,
  topK: number
): Promise<SearchResult[]> {
  const results = await prisma.$queryRaw<KeywordSearchRow[]>(
    Prisma.sql`
      SELECT
        c."id", c."content",
        ts_rank(to_tsvector('simple', c."content"), plainto_tsquery('simple', ${query})) as rank,
        c."sourceId", s."name" as "sourceName", s."type" as "sourceType", c."metadata"
      FROM "KBChunk" c
      INNER JOIN "KBSource" s ON c."sourceId" = s."id"
      WHERE s."knowledgeBaseId" = ${knowledgeBaseId}
        AND s."status" = 'READY'
        AND to_tsvector('simple', c."content") @@ plainto_tsquery('simple', ${query})
      ORDER BY rank DESC
      LIMIT ${topK}
    `
  );

  return results.map((r) => {
    const meta = parseMetadata(r.metadata);
    return {
      chunkId: r.id,
      content: sanitizeChunkContent(r.content),
      similarity: Number(r.rank),
      sourceId: r.sourceId,
      sourceDocument: r.sourceName ?? undefined,
      sourceType: r.sourceType ?? undefined,
      pageNumber: typeof meta.page === "number" ? meta.page : undefined,
      chunkIndex: typeof meta.index === "number" ? meta.index : undefined,
      relevanceScore: Number(r.rank),
      metadata: meta,
    };
  });
}

export function reciprocalRankFusion(
  semanticResults: SearchResult[],
  keywordResults: SearchResult[],
  semanticWeight: number = 0.5,
  keywordWeight: number = 0.5,
  k: number = 60
): SearchResult[] {
  const scoreMap = new Map<string, { score: number; result: SearchResult }>();

  for (let i = 0; i < semanticResults.length; i++) {
    const result = semanticResults[i];
    const rrfScore = semanticWeight / (k + i + 1);
    const existing = scoreMap.get(result.chunkId);
    if (existing) { existing.score += rrfScore; }
    else { scoreMap.set(result.chunkId, { score: rrfScore, result: { ...result } }); }
  }

  for (let i = 0; i < keywordResults.length; i++) {
    const result = keywordResults[i];
    const rrfScore = keywordWeight / (k + i + 1);
    const existing = scoreMap.get(result.chunkId);
    if (existing) { existing.score += rrfScore; }
    else { scoreMap.set(result.chunkId, { score: rrfScore, result: { ...result } }); }
  }

  return Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .map(({ score, result }) => ({ ...result, relevanceScore: score }));
}

function normalizeRRFScores(results: SearchResult[]): SearchResult[] {
  if (results.length === 0) return results;
  const maxScore = results[0].relevanceScore;
  if (maxScore === 0) return results;
  return results.map((r) => ({
    ...r,
    relevanceScore: r.relevanceScore / maxScore,
  }));
}

export function computeDynamicTopK(query: string, configuredTopK: number): number {
  const wordCount = query.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 3) return Math.min(3, configuredTopK);
  if (wordCount <= 8) return Math.min(5, configuredTopK);
  return Math.min(7, configuredTopK);
}

interface NeighborChunkRow {
  id: string;
  content: string;
  sourceId: string;
  metadata: string | Record<string, unknown> | null;
}

export async function expandChunksWithContext(
  results: SearchResult[],
  contextWindow: number = 1
): Promise<SearchResult[]> {
  if (results.length === 0) return [];

  const grouped = new Map<string, SearchResult[]>();
  for (const result of results) {
    if (result.chunkIndex === undefined) continue;
    const existing = grouped.get(result.sourceId) ?? [];
    existing.push(result);
    grouped.set(result.sourceId, existing);
  }

  const expandedMap = new Map<string, SearchResult>();

  for (const [sourceId, chunks] of grouped) {
    const indexSet = new Set<number>();
    for (const chunk of chunks) {
      const idx = chunk.chunkIndex!;
      for (let offset = -contextWindow; offset <= contextWindow; offset++) {
        const target = idx + offset;
        if (target >= 0) indexSet.add(target);
      }
    }

    const indices = Array.from(indexSet).sort((a, b) => a - b);
    if (indices.length === 0) continue;

    // Use a PostgreSQL array literal string (e.g. '{0,1}') — valid int[] syntax.
    // Note: jsonb::int[] cast is not supported in PostgreSQL; text::int[] works.
    const indicesLiteral = `{${indices.join(",")}}`;
    const neighbors = await prisma.$queryRaw<NeighborChunkRow[]>(
      Prisma.sql`
        SELECT c."id", c."content", c."sourceId", c."metadata"
        FROM "KBChunk" c
        WHERE c."sourceId" = ${sourceId}
          AND (c."metadata"->>'index')::int = ANY(${indicesLiteral}::int[])
        ORDER BY (c."metadata"->>'index')::int ASC
      `
    );

    const neighborsByIndex = new Map<number, NeighborChunkRow>();
    for (const n of neighbors) {
      const meta = parseMetadata(n.metadata);
      const idx = typeof meta.index === "number" ? meta.index : -1;
      if (idx >= 0) neighborsByIndex.set(idx, n);
    }

    const ranges: { start: number; end: number }[] = [];
    let rangeStart = indices[0];
    let rangeEnd = indices[0];
    for (let i = 1; i < indices.length; i++) {
      if (indices[i] === rangeEnd + 1) {
        rangeEnd = indices[i];
      } else {
        ranges.push({ start: rangeStart, end: rangeEnd });
        rangeStart = indices[i];
        rangeEnd = indices[i];
      }
    }
    ranges.push({ start: rangeStart, end: rangeEnd });

    for (const range of ranges) {
      const parts: string[] = [];
      let bestScore = 0;
      let bestChunk: SearchResult | undefined;

      for (let idx = range.start; idx <= range.end; idx++) {
        const neighbor = neighborsByIndex.get(idx);
        if (neighbor) parts.push(neighbor.content);

        const matchedChunk = chunks.find((c) => c.chunkIndex === idx);
        if (matchedChunk && matchedChunk.relevanceScore > bestScore) {
          bestScore = matchedChunk.relevanceScore;
          bestChunk = matchedChunk;
        }
      }

      if (bestChunk && parts.length > 0) {
        const key = `${sourceId}:${range.start}-${range.end}`;
        expandedMap.set(key, {
          ...bestChunk,
          content: parts.join("\n"),
        });
      }
    }
  }

  for (const result of results) {
    if (result.chunkIndex === undefined) {
      expandedMap.set(result.chunkId, result);
    }
  }

  const expanded = Array.from(expandedMap.values())
    .sort((a, b) => b.relevanceScore - a.relevanceScore);

  let totalTokens = 0;
  const trimmed: SearchResult[] = [];
  for (const result of expanded) {
    const tokens = estimateTokens(result.content);
    if (totalTokens + tokens > MAX_CONTEXT_TOKENS && trimmed.length > 0) break;
    trimmed.push(result);
    totalTokens += tokens;
  }

  return trimmed;
}

/**
 * Determines if reranking should be enabled for a query.
 * Auto-enables for short/ambiguous queries (< 5 words) unless explicitly disabled.
 */
export function shouldRerank(query: string, explicitRerank: boolean | undefined): boolean {
  if (explicitRerank === false) return false;
  if (explicitRerank === true) return true;

  const wordCount = query.split(/\s+/).filter(Boolean).length;
  return wordCount < SHORT_QUERY_WORD_THRESHOLD;
}

export async function hybridSearch(
  query: string,
  knowledgeBaseId: string,
  options?: HybridSearchOptions
): Promise<SearchResult[]> {
  const kbConfig = await loadKBConfig(knowledgeBaseId);

  const topK = options?.topK ?? kbConfig?.searchTopK ?? 5;
  const semanticWeight = options?.semanticWeight ?? kbConfig?.hybridAlpha ?? 0.7;
  const keywordWeight = options?.keywordWeight ?? (1 - semanticWeight);
  const threshold = kbConfig?.searchThreshold ?? DEFAULT_RELEVANCE_THRESHOLD;
  const retrievalMode = kbConfig?.retrievalMode ?? "hybrid";
  const contextOrderingStrategy = (kbConfig?.contextOrdering ?? "relevance") as ContextOrderingStrategy;
  const embeddingModel = kbConfig?.embeddingModel ?? undefined;
  const abTestVariant = options?.abTestVariant;

  const queryTransformMode = kbConfig?.queryTransform as "none" | "hyde" | "multi_query" | undefined;
  const configRerankModel = kbConfig?.rerankingModel ?? "none";
  const rerankModel = options?.rerank === false
    ? "none"
    : options?.rerank === true
      ? (configRerankModel !== "none" ? configRerankModel : "llm-rubric")
      : shouldRerank(query, undefined)
        ? (configRerankModel !== "none" ? configRerankModel : "llm-rubric")
        : "none";

  const candidateK = rerankModel !== "none" ? Math.max(topK, 20) : topK * 2;

  // Query transformation (HyDE / multi-query)
  const transformed = queryTransformMode && queryTransformMode !== "none"
    ? await transformQuery(query, queryTransformMode)
    : { queries: [query] };

  // For multi-query: run search for each expanded query and merge results
  if (transformed.queries.length > 1) {
    const allResults = new Map<string, SearchResult>();
    for (const expandedQuery of transformed.queries) {
      const partial = await runSingleSearch(
        expandedQuery, knowledgeBaseId, candidateK, retrievalMode,
        semanticWeight, keywordWeight, embeddingModel
      );
      for (const r of partial) {
        const existing = allResults.get(r.chunkId);
        if (!existing || r.relevanceScore > existing.relevanceScore) {
          allResults.set(r.chunkId, r);
        }
      }
    }
    const merged = Array.from(allResults.values()).sort((a, b) => b.relevanceScore - a.relevanceScore);
    return applyPostProcessing(merged, query, topK, threshold, rerankModel, knowledgeBaseId, abTestVariant, options?.metadataFilter, retrievalMode, contextOrderingStrategy);
  }

  // For HyDE: use hypothetical document for semantic embedding, original query for keyword
  const hydeOverride = transformed.hydeDocument;

  let searchResults: SearchResult[];

  if (retrievalMode === "semantic") {
    searchResults = await searchKnowledgeBase(knowledgeBaseId, query, candidateK, embeddingModel, hydeOverride);
  } else if (retrievalMode === "keyword") {
    searchResults = await keywordSearch(knowledgeBaseId, query, candidateK);
  } else {
    const [semanticResults, keywordResults] = await Promise.all([
      searchKnowledgeBase(knowledgeBaseId, query, candidateK, embeddingModel, hydeOverride),
      keywordSearch(knowledgeBaseId, query, candidateK),
    ]);
    searchResults = normalizeRRFScores(
      reciprocalRankFusion(semanticResults, keywordResults, semanticWeight, keywordWeight)
    );
  }

  return applyPostProcessing(searchResults, query, topK, threshold, rerankModel, knowledgeBaseId, abTestVariant, options?.metadataFilter, retrievalMode, contextOrderingStrategy);
}

async function runSingleSearch(
  query: string,
  knowledgeBaseId: string,
  candidateK: number,
  retrievalMode: string,
  semanticWeight: number,
  keywordWeight: number,
  embeddingModel?: string
): Promise<SearchResult[]> {
  if (retrievalMode === "semantic") {
    return searchKnowledgeBase(knowledgeBaseId, query, candidateK, embeddingModel);
  }
  if (retrievalMode === "keyword") {
    return keywordSearch(knowledgeBaseId, query, candidateK);
  }
  const [sem, kw] = await Promise.all([
    searchKnowledgeBase(knowledgeBaseId, query, candidateK, embeddingModel),
    keywordSearch(knowledgeBaseId, query, candidateK),
  ]);
  return normalizeRRFScores(reciprocalRankFusion(sem, kw, semanticWeight, keywordWeight));
}

async function applyPostProcessing(
  searchResults: SearchResult[],
  query: string,
  topK: number,
  threshold: number,
  rerankModel: string,
  knowledgeBaseId: string,
  abTestVariant: string | undefined,
  metadataFilter: MetadataFilter | undefined,
  retrievalMode: string,
  contextOrderingStrategy: ContextOrderingStrategy = "relevance"
): Promise<SearchResult[]> {
  let fused = metadataFilter
    ? searchResults.filter((r) =>
        evaluateFilter(metadataFilter, r.metadata ?? {}, {
          type: r.sourceType ?? "",
          name: r.sourceDocument ?? "",
        })
      )
    : searchResults;

  if (rerankModel !== "none" && fused.length > topK) {
    const rerankStart = Date.now();
    try {
      const { rerankResults } = await import("./reranker");
      fused = await rerankResults(query, fused, topK, rerankModel);

      const rerankDurationMs = Date.now() - rerankStart;
      recordMetric("kb.search.rerank.duration", rerankDurationMs, "ms", {
        knowledgeBaseId,
        ...(abTestVariant ? { abTestVariant } : {}),
      });
    } catch {
      logger.warn("Re-ranking failed, using RRF order", { knowledgeBaseId });
    }
  }

  const filtered = fused
    .filter((r) => r.relevanceScore >= threshold)
    .slice(0, topK);

  const ordered = orderContext(filtered, contextOrderingStrategy);
  const results = compressContext(ordered, 4000);

  recordMetric("kb.search.results", results.length, "count", {
    knowledgeBaseId,
    reranked: rerankModel !== "none" ? 1 : 0,
    rerankModel,
    retrievalMode,
    queryWordCount: query.split(/\s+/).filter(Boolean).length,
    ...(abTestVariant ? { abTestVariant } : {}),
  });

  // Fire-and-forget: track which chunks were retrieved
  if (results.length > 0) {
    updateChunkRetrievalStats(results.map((r) => r.chunkId)).catch(() => {});
  }

  return results;
}
