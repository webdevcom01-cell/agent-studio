export { parsePDF, parseHTML, fetchAndParseURL, parseText, parseSource, parseExcel, parsePPTX } from "./parsers";
export {
  chunkText,
  buildChunkHeader,
  injectHeaders,
  estimateTokens,
  countTokens,
  chunkRecursive,
  chunkMarkdown,
  chunkCode,
  chunkSentences,
  chunkByStrategy,
  DEFAULT_STRATEGY,
} from "./chunker";
export type { ChunkingStrategy, ChunkMetadata } from "./chunker";
export { generateEmbedding, generateEmbeddings } from "./embeddings";
export { computeContentHash, findDuplicateChunks, deduplicateChunks } from "./deduplication";
export { searchKnowledgeBase, hybridSearch, reciprocalRankFusion } from "./search";
export type { SearchResult, HybridSearchOptions } from "./search";
export { rerankResults } from "./reranker";
export { ingestSource, deleteSourceChunks } from "./ingest";
export {
  getCachedQueryEmbedding,
  setCachedQueryEmbedding,
  acquireEmbeddingSemaphore,
  releaseEmbeddingSemaphore,
} from "./embedding-cache";
export { hydeTransform, multiQueryExpand, transformQuery } from "./query-transform";
export { evaluateFilter, buildMetadataWhereClause } from "./metadata-filter";
export type { MetadataFilter, MetadataFilterCondition, MetadataFilterGroup, MetadataFilterOperator } from "./metadata-filter";
export {
  orderContext,
  orderByRelevance,
  orderLostInMiddle,
  orderChronological,
  orderByDiversity,
  compressContext,
} from "./context-ordering";
export type { ContextOrderingStrategy } from "./context-ordering";
export { detectEmbeddingDrift, markChunkEmbeddingModel } from "./embedding-drift";
export type { EmbeddingDriftStatus } from "./embedding-drift";
export { extractCitations, formatCitationsForAI, formatCitationsForUI } from "./citations";
export type { Citation } from "./citations";
export { getKBAnalytics } from "./analytics";
export type { KBAnalytics } from "./analytics";
export {
  evaluateRAGAS,
  evaluateFaithfulness,
  evaluateContextPrecision,
  evaluateAnswerRelevancy,
} from "./ragas";
export type { RAGASMetrics, RAGASEvalInput } from "./ragas";
export {
  detectDeadChunks,
  cleanupDeadChunks,
  updateChunkRetrievalStats,
  getSourcesDueForReingestion,
  triggerReingestion,
} from "./maintenance";
export type { DeadChunkReport } from "./maintenance";
