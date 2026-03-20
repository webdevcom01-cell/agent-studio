/**
 * Redis client singleton for shared state (rate limiting, caching).
 *
 * Uses ioredis with automatic reconnection. Falls back gracefully when
 * REDIS_URL is not configured — callers check isRedisAvailable() before use.
 *
 * Railway internal networking: redis://default:***@redis.railway.internal:6379
 */

import { logger } from "@/lib/logger";

let redisClient: RedisClient | null = null;
let connectionFailed = false;

interface RedisClient {
  eval(script: string, numkeys: number, ...args: (string | number)[]): Promise<unknown>;
  quit(): Promise<void>;
  status: string;
}

/**
 * Returns the Redis client, or null if not configured / connection failed.
 * Lazy-initializes on first call.
 */
export async function getRedis(): Promise<RedisClient | null> {
  if (connectionFailed) return null;
  if (redisClient) return redisClient;

  const url = process.env.REDIS_URL;
  if (!url) return null;

  try {
    const Redis = (await import("ioredis")).default;
    const client = new Redis(url, {
      maxRetriesPerRequest: 1,
      retryStrategy(times: number) {
        if (times > 3) {
          connectionFailed = true;
          return null;
        }
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
      connectTimeout: 5000,
    });

    await client.connect();
    redisClient = client as unknown as RedisClient;
    logger.info("Redis connected", { url: url.replace(/\/\/.*@/, "//***@") });
    return redisClient;
  } catch (err) {
    connectionFailed = true;
    logger.warn("Redis connection failed, using in-memory fallback", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Checks if Redis is available without triggering connection.
 */
export function isRedisConfigured(): boolean {
  return !!process.env.REDIS_URL && !connectionFailed;
}

/**
 * Resets the connection state (for testing).
 */
export function resetRedis(): void {
  if (redisClient) {
    redisClient.quit().catch(() => {});
  }
  redisClient = null;
  connectionFailed = false;
}
