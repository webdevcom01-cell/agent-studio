import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { generateEmbedding } from "./embeddings";

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

export async function hybridSearch(
  query: string,
  knowledgeBaseId: string,
  options?: HybridSearchOptions
): Promise<SearchResult[]> {
  const {
    topK = 5,
    semanticWeight = 0.5,
    keywordWeight = 0.5,
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

  return fused.slice(0, topK);
}
