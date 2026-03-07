import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { generateEmbedding } from "./embeddings";
import { estimateTokens } from "./chunker";

const MIN_RELEVANCE_SCORE = 0.25;
const MAX_CONTEXT_TOKENS = 4000;

export interface SearchResult {
  chunkId: string;
  content: string;
  similarity: number;
  sourceId: string;
  sourceDocument?: string;
  pageNumber?: number;
  chunkIndex?: number;
  relevanceScore: number;
}

export interface HybridSearchOptions {
  topK?: number;
  semanticWeight?: number;
  keywordWeight?: number;
  rerank?: boolean;
}

interface VectorSearchRow {
  id: string;
  content: string;
  similarity: number;
  sourceId: string;
  sourceName: string;
  metadata: string | Record<string, unknown> | null;
}

interface KeywordSearchRow {
  id: string;
  content: string;
  rank: number;
  sourceId: string;
  sourceName: string;
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
  topK: number = 5
): Promise<SearchResult[]> {
  const queryEmbedding = await generateEmbedding(query);
  if (!queryEmbedding.every(v => typeof v === 'number' && isFinite(v))) {
    throw new Error('Invalid embedding');
  }

  const vectorStr = `[${queryEmbedding.join(",")}]`;

  const results = await prisma.$queryRaw<VectorSearchRow[]>(
    Prisma.sql`
      SELECT
        c."id", c."content",
        1 - (c."embedding" <=> ${Prisma.raw(vectorStr)}::vector) as similarity,
        c."sourceId", s."name" as "sourceName", c."metadata"
      FROM "KBChunk" c
      INNER JOIN "KBSource" s ON c."sourceId" = s."id"
      WHERE s."knowledgeBaseId" = ${knowledgeBaseId}
        AND s."status" = 'READY'
        AND c."embedding" IS NOT NULL
      ORDER BY c."embedding" <=> ${Prisma.raw(vectorStr)}::vector
      LIMIT ${topK}
    `
  );

  return results.map((r) => {
    const meta = parseMetadata(r.metadata);
    return {
      chunkId: r.id,
      content: r.content,
      similarity: Number(r.similarity),
      sourceId: r.sourceId,
      sourceDocument: r.sourceName ?? undefined,
      pageNumber: typeof meta.page === "number" ? meta.page : undefined,
      chunkIndex: typeof meta.index === "number" ? meta.index : undefined,
      relevanceScore: Number(r.similarity),
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
        c."sourceId", s."name" as "sourceName", c."metadata"
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
      content: r.content,
      similarity: Number(r.rank),
      sourceId: r.sourceId,
      sourceDocument: r.sourceName ?? undefined,
      pageNumber: typeof meta.page === "number" ? meta.page : undefined,
      chunkIndex: typeof meta.index === "number" ? meta.index : undefined,
      relevanceScore: Number(r.rank),
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

    const indicesJson = JSON.stringify(indices);
    const neighbors = await prisma.$queryRaw<NeighborChunkRow[]>(
      Prisma.sql`
        SELECT c."id", c."content", c."sourceId", c."metadata"
        FROM "KBChunk" c
        WHERE c."sourceId" = ${sourceId}
          AND (c."metadata"->>'index')::int = ANY(${indicesJson}::jsonb::int[])
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

export async function hybridSearch(
  query: string,
  knowledgeBaseId: string,
  options?: HybridSearchOptions
): Promise<SearchResult[]> {
  const {
    topK = 5,
    semanticWeight = 0.7,
    keywordWeight = 0.3,
    rerank = false,
  } = options ?? {};

  const candidateK = rerank ? Math.max(topK, 20) : topK * 2;

  const [semanticResults, keywordResults] = await Promise.all([
    searchKnowledgeBase(knowledgeBaseId, query, candidateK),
    keywordSearch(knowledgeBaseId, query, candidateK),
  ]);

  let fused = reciprocalRankFusion(semanticResults, keywordResults, semanticWeight, keywordWeight);

  if (rerank && fused.length > topK) {
    try {
      const { rerankResults } = await import("./reranker");
      fused = await rerankResults(query, fused, topK);
    } catch (error) {
      console.error("Re-ranking failed, using RRF order:", error);
    }
  }

  return fused
    .filter((r) => r.relevanceScore >= MIN_RELEVANCE_SCORE)
    .slice(0, topK);
}
