/**
 * Sliding window rate limiter with Redis backend and in-memory fallback.
 *
 * Uses Redis EVAL (Lua script) for atomic sliding window when available.
 * Falls back to in-memory Map when Redis is not configured or unavailable.
 * Both backends share the same API and behavior.
 */

import { getRedis } from "@/lib/redis";
import { logger } from "@/lib/logger";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;
const CLEANUP_INTERVAL_MS = 60_000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

/**
 * Redis Lua script for atomic sliding window rate limiting.
 * KEYS[1] = rate limit key
 * ARGV[1] = current timestamp (ms)
 * ARGV[2] = window size (ms)
 * ARGV[3] = max requests
 *
 * Returns [allowed (0/1), remaining, retryAfterMs]
 */
const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local maxReq = tonumber(ARGV[3])
local windowStart = now - window

redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)

local count = redis.call('ZCARD', key)

if count >= maxReq then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retryAfter = 0
  if #oldest >= 2 then
    retryAfter = window - (now - tonumber(oldest[2]))
  end
  return {0, 0, retryAfter}
end

redis.call('ZADD', key, now, now .. '-' .. math.random(1000000))
redis.call('PEXPIRE', key, window + 1000)

return {1, maxReq - count - 1, 0}
`;

// ── In-memory fallback ──────────────────────────────────────────────────

interface RateLimitEntry {
  timestamps: number[];
}

const globalForRateLimit = globalThis as unknown as {
  rateLimitStore?: Map<string, RateLimitEntry>;
  rateLimitTimer?: ReturnType<typeof setInterval>;
};

const store = globalForRateLimit.rateLimitStore ?? new Map<string, RateLimitEntry>();
globalForRateLimit.rateLimitStore = store;

function checkInMemory(key: string, maxRequests: number): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key) ?? { timestamps: [] };

  entry.timestamps = entry.timestamps.filter((t) => now - t < WINDOW_MS);

  if (entry.timestamps.length >= maxRequests) {
    const oldestInWindow = entry.timestamps[0];
    const retryAfterMs = WINDOW_MS - (now - oldestInWindow);
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  entry.timestamps.push(now);
  store.set(key, entry);

  return {
    allowed: true,
    remaining: maxRequests - entry.timestamps.length,
    retryAfterMs: 0,
  };
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Check rate limit for a key. Tries Redis first, falls back to in-memory.
 * The Redis check is async but we need a sync API for existing consumers.
 * Strategy: attempt Redis asynchronously; if pending, use in-memory.
 *
 * For truly distributed rate limiting, use checkRateLimitAsync().
 */
export function checkRateLimit(key: string, maxRequests: number = MAX_REQUESTS): RateLimitResult {
  // Fire-and-forget Redis sync. For hot path, use in-memory and
  // let Redis catch up on next call.
  triggerRedisSync(key, maxRequests);
  return checkInMemory(key, maxRequests);
}

/**
 * Async rate limit check using Redis when available.
 * Use this in API routes where you can await.
 */
export async function checkRateLimitAsync(
  key: string,
  maxRequests: number = MAX_REQUESTS
): Promise<RateLimitResult> {
  try {
    const redis = await getRedis();
    if (redis) {
      const result = await redis.eval(
        SLIDING_WINDOW_SCRIPT,
        1,
        `ratelimit:${key}`,
        Date.now(),
        WINDOW_MS,
        maxRequests
      ) as [number, number, number];

      return {
        allowed: result[0] === 1,
        remaining: result[1],
        retryAfterMs: Math.max(0, result[2]),
      };
    }
  } catch (err) {
    logger.warn("Redis rate limit failed, using in-memory fallback", {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return checkInMemory(key, maxRequests);
}

// ── Background Redis sync ───────────────────────────────────────────────

let pendingSync = false;

function triggerRedisSync(key: string, maxRequests: number): void {
  if (pendingSync || !process.env.REDIS_URL) return;
  pendingSync = true;

  // Non-blocking: record the hit in Redis for cross-replica visibility
  checkRateLimitAsync(key, maxRequests)
    .catch(() => {})
    .finally(() => {
      pendingSync = false;
    });
}

// ── Cleanup ─────────────────────────────────────────────────────────────

function startCleanup(): void {
  if (globalForRateLimit.rateLimitTimer) return;
  if (typeof setInterval === "undefined") return;

  globalForRateLimit.rateLimitTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      entry.timestamps = entry.timestamps.filter((t) => now - t < WINDOW_MS);
      if (entry.timestamps.length === 0) store.delete(key);
    }
  }, CLEANUP_INTERVAL_MS);
}

export function stopCleanup(): void {
  if (globalForRateLimit.rateLimitTimer) {
    clearInterval(globalForRateLimit.rateLimitTimer);
    globalForRateLimit.rateLimitTimer = undefined;
  }
  store.clear();
}

startCleanup();
