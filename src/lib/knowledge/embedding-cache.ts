/**
 * Embedding cache and concurrency control via Redis.
 *
 * - Query embedding cache: avoids re-embedding identical queries (10-min TTL)
 * - Embedding semaphore: limits concurrent embedding API calls to 3
 *
 * All operations gracefully degrade when Redis is unavailable.
 */

import { cacheGet, cacheSet, getRedis } from "@/lib/redis";

const CACHE_TTL_SECONDS = 600;
const CACHE_PREFIX = "emb:";
const SEMAPHORE_KEY = "emb:semaphore";
const SEMAPHORE_MAX = 3;
const SEMAPHORE_TTL_SECONDS = 30;

/**
 * Lua script for atomic semaphore acquire:
 * INCR key, check if <= max, set EXPIRE. If over max, DECR and return 0.
 */
const ACQUIRE_SCRIPT = `
local key = KEYS[1]
local max = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local current = redis.call('INCR', key)
redis.call('EXPIRE', key, ttl)
if current > max then
  redis.call('DECR', key)
  return 0
end
return 1
`;

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

function buildCacheKey(query: string): string {
  return `${CACHE_PREFIX}${normalizeQuery(query)}`;
}

/**
 * Returns a cached query embedding, or null on miss / Redis unavailable.
 */
export async function getCachedQueryEmbedding(query: string): Promise<number[] | null> {
  try {
    const raw = await cacheGet(buildCacheKey(query));
    if (!raw) return null;
    return JSON.parse(raw) as number[];
  } catch {
    return null;
  }
}

/**
 * Caches a query embedding with 10-minute TTL.
 * Graceful — never throws if Redis is unavailable.
 */
export async function setCachedQueryEmbedding(query: string, embedding: number[]): Promise<void> {
  try {
    await cacheSet(buildCacheKey(query), JSON.stringify(embedding), CACHE_TTL_SECONDS);
  } catch {
    // Fire-and-forget
  }
}

/**
 * Acquires an embedding semaphore slot (max 3 concurrent).
 * Returns true if acquired, false if at capacity.
 * Returns true (allow) when Redis is unavailable — never blocks without Redis.
 */
export async function acquireEmbeddingSemaphore(): Promise<boolean> {
  try {
    const redis = await getRedis();
    if (!redis) return true;

    const result = await redis.eval(
      ACQUIRE_SCRIPT,
      1,
      SEMAPHORE_KEY,
      SEMAPHORE_MAX,
      SEMAPHORE_TTL_SECONDS
    );

    return result === 1;
  } catch {
    return true;
  }
}

/**
 * Releases an embedding semaphore slot.
 * Graceful — never throws.
 */
export async function releaseEmbeddingSemaphore(): Promise<void> {
  try {
    const redis = await getRedis();
    if (!redis) return;

    // Atomic DECR with floor at 0
    await redis.eval(
      `local v = redis.call('DECR', KEYS[1]); if v < 0 then redis.call('SET', KEYS[1], 0) end; return v`,
      1,
      SEMAPHORE_KEY
    );
  } catch {
    // Fire-and-forget
  }
}
