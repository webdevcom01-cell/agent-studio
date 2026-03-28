import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
import { cacheGet, cacheSet } from "@/lib/redis";
import { generateEmbedding } from "@/lib/knowledge/embeddings";

const DEFAULT_TTL_SECONDS = 300;
const DEFAULT_OUTPUT_VARIABLE = "cache_result";
const SIMILARITY_THRESHOLD = 0.95;

/** In-memory fallback when Redis is unavailable */
const memoryCache = new Map<string, { value: string; expiresAt: number }>();

const MAX_MEMORY_ENTRIES = 1000;
const CACHE_PREFIX = "flow-cache:";

/**
 * cache — Caches values with exact or semantic key matching.
 * Uses Redis when available, falls back to in-memory Map.
 */
export const cacheHandler: NodeHandler = async (node, context) => {
  const operation = (node.data.operation as string) ?? "get";
  const cacheKey = resolveTemplate(
    (node.data.cacheKey as string) ?? "",
    context.variables,
  );
  const outputVariable =
    (node.data.outputVariable as string) || DEFAULT_OUTPUT_VARIABLE;
  const ttl = (node.data.ttlSeconds as number) ?? DEFAULT_TTL_SECONDS;
  const matchMode = (node.data.matchMode as string) ?? "exact";

  if (!cacheKey) {
    return {
      messages: [
        { role: "assistant", content: "Cache node has no key configured." },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  try {
    if (operation === "set") {
      const value = resolveTemplate(
        (node.data.value as string) ?? "",
        context.variables,
      );
      await setCacheValue(cacheKey, value, ttl);

      return {
        messages: [],
        nextNodeId: null,
        waitForInput: false,
        updatedVariables: {
          ...context.variables,
          [`${outputVariable}_status`]: "stored",
        },
      };
    }

    if (operation === "delete") {
      await deleteCacheValue(cacheKey);
      return {
        messages: [],
        nextNodeId: null,
        waitForInput: false,
        updatedVariables: {
          ...context.variables,
          [`${outputVariable}_status`]: "deleted",
        },
      };
    }

    // Default: get
    let cached: string | null = null;

    if (matchMode === "semantic") {
      cached = await semanticLookup(cacheKey);
    } else {
      cached = await getCacheValue(cacheKey);
    }

    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: cached ?? "",
        [`${outputVariable}_hit`]: cached !== null,
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: `[Error: ${errorMsg}]`,
        [`${outputVariable}_hit`]: false,
      },
    };
  }
};

async function getCacheValue(key: string): Promise<string | null> {
  const redisValue = await cacheGet(`${CACHE_PREFIX}${key}`);
  if (redisValue !== null) return redisValue;

  const entry = memoryCache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.value;
  if (entry) memoryCache.delete(key);

  return null;
}

async function setCacheValue(
  key: string,
  value: string,
  ttl: number,
): Promise<void> {
  await cacheSet(`${CACHE_PREFIX}${key}`, value, ttl);

  if (memoryCache.size >= MAX_MEMORY_ENTRIES) {
    const oldest = memoryCache.keys().next().value;
    if (oldest !== undefined) memoryCache.delete(oldest);
  }
  memoryCache.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
}

async function deleteCacheValue(key: string): Promise<void> {
  const { cacheDel } = await import("@/lib/redis");
  await cacheDel(`${CACHE_PREFIX}${key}`);
  memoryCache.delete(key);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Semantic cache lookup: embed the query, compare against stored embeddings.
 * Falls back to exact match if embedding fails.
 */
async function semanticLookup(query: string): Promise<string | null> {
  try {
    const queryEmbedding = await generateEmbedding(query);

    // Check in-memory entries with embeddings
    for (const [, entry] of memoryCache) {
      if (entry.expiresAt <= Date.now()) continue;
      const stored = entry as { value: string; expiresAt: number; embedding?: number[] };
      if (!stored.embedding) continue;
      const sim = cosineSimilarity(queryEmbedding, stored.embedding);
      if (sim >= SIMILARITY_THRESHOLD) return stored.value;
    }
  } catch {
    // Embedding unavailable — fall back to exact
  }

  return getCacheValue(query);
}
