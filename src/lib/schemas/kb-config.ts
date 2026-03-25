import { z } from "zod";

const chunkSizeField = z.number().int().min(50).max(2048).default(512);
const chunkOverlapField = z.number().int().min(0).max(512).default(100);

export const ChunkingStrategySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("fixed"),
    chunkSize: chunkSizeField,
    chunkOverlap: chunkOverlapField,
  }),
  z.object({
    type: z.literal("recursive"),
    chunkSize: chunkSizeField,
    chunkOverlap: chunkOverlapField,
    separators: z.array(z.string()).optional(),
  }),
  z.object({
    type: z.literal("markdown"),
    chunkSize: chunkSizeField,
    chunkOverlap: chunkOverlapField,
    preserveHeaders: z.boolean().default(true),
  }),
  z.object({
    type: z.literal("code"),
    chunkSize: chunkSizeField,
    chunkOverlap: chunkOverlapField,
    language: z.enum(["python", "typescript", "javascript"]).optional(),
  }),
  z.object({
    type: z.literal("sentence"),
    chunkSize: chunkSizeField,
    chunkOverlap: chunkOverlapField,
  }),
]);

export const kbConfigUpdateSchema = z.object({
  chunkingStrategy: ChunkingStrategySchema.optional(),
  embeddingModel: z.enum(["text-embedding-3-small", "text-embedding-3-large"]).optional(),
  embeddingDimension: z.number().int().min(256).max(3072).optional(),
  retrievalMode: z.enum(["semantic", "keyword", "hybrid"]).optional(),
  rerankingModel: z.enum(["none", "llm-rubric", "cohere"]).optional(),
  queryTransform: z.enum(["none", "hyde", "multi_query"]).optional(),
  searchTopK: z.number().int().min(1).max(50).optional(),
  searchThreshold: z.number().min(0).max(1).optional(),
  hybridAlpha: z.number().min(0).max(1).optional(),
  maxChunks: z.number().int().min(50).max(5000).optional(),
  contextOrdering: z.enum(["relevance", "lost_in_middle", "chronological", "diversity"]).optional(),
});

export const kbConfigResponseSchema = z.object({
  chunkingStrategy: ChunkingStrategySchema.nullable().default(null),
  embeddingModel: z.string().default("text-embedding-3-small"),
  embeddingDimension: z.number().int().default(1536),
  retrievalMode: z.string().default("hybrid"),
  rerankingModel: z.string().default("llm-rubric"),
  queryTransform: z.string().default("none"),
  searchTopK: z.number().int().default(5),
  searchThreshold: z.number().default(0.25),
  hybridAlpha: z.number().default(0.7),
  maxChunks: z.number().int().default(500),
  contextOrdering: z.string().default("relevance"),
});

export type ChunkingStrategy = z.infer<typeof ChunkingStrategySchema>;
export type KBConfigUpdate = z.infer<typeof kbConfigUpdateSchema>;
export type KBConfigResponse = z.infer<typeof kbConfigResponseSchema>;

const EMBEDDING_DIMENSIONS: Record<string, number> = {
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
};

export function resolveEmbeddingDimension(
  model: string,
  explicitDimension?: number
): number {
  if (explicitDimension !== undefined) return explicitDimension;
  return EMBEDDING_DIMENSIONS[model] ?? 1536;
}
