-- Add HNSW index for vector similarity search on KBChunk.embedding
-- Without this index, every semantic search is a full table scan (O(n)).
-- Run in Supabase SQL editor or via psql against DIRECT_URL.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kbchunk_embedding_hnsw
ON "KBChunk" USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
