/**
 * Redis client singleton for shared state across replicas.
 *
 * Provides: rate limiting (Lua EVAL), generic cache (get/set/del),
 * MCP pool coordination, session cache for JWT validation.
 *
 * Falls back gracefully when REDIS_URL is not configured.
 * Railway internal networking: redis://default:***@redis.railway.internal:6379
 */

import { logger } from "@/lib/logger";

let redisClient: RedisClient | null = null;
let connectionFailed = false;

interface RedisClient {
  eval(script: string, numkeys: number, ...args: (string | number)[]): Promise<unknown>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: (string | number)[]): Promise<unknown>;
  setex(key: string, seconds: number, value: string): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  keys(pattern: string): Promise<string[]>;
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

// ── Generic cache helpers ───────────────────────────────────────────────

/**
 * Get a cached value. Returns null on miss or Redis unavailable.
 */
export async function cacheGet(key: string): Promise<string | null> {
  try {
    const redis = await getRedis();
    if (!redis) return null;
    return await redis.get(`cache:${key}`);
  } catch {
    return null;
  }
}

/**
 * Set a cached value with TTL in seconds.
 */
export async function cacheSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  try {
    const redis = await getRedis();
    if (!redis) return;
    await redis.setex(`cache:${key}`, ttlSeconds, value);
  } catch {
    // Fire-and-forget
  }
}

/**
 * Delete a cached value.
 */
export async function cacheDel(key: string): Promise<void> {
  try {
    const redis = await getRedis();
    if (!redis) return;
    await redis.del(`cache:${key}`);
  } catch {
    // Fire-and-forget
  }
}

// ── Session cache ───────────────────────────────────────────────────────

const SESSION_CACHE_TTL = 300; // 5 minutes
const SESSION_PREFIX = "session:";

/**
 * Cache a session result by user ID. Avoids repeated JWT decode on every API call.
 */
export async function cacheSession(userId: string, sessionData: string): Promise<void> {
  await cacheSet(`${SESSION_PREFIX}${userId}`, sessionData, SESSION_CACHE_TTL);
}

/**
 * Get a cached session by user ID.
 */
export async function getCachedSession(userId: string): Promise<string | null> {
  return cacheGet(`${SESSION_PREFIX}${userId}`);
}

/**
 * Invalidate a cached session (on logout or token refresh).
 */
export async function invalidateSession(userId: string): Promise<void> {
  await cacheDel(`${SESSION_PREFIX}${userId}`);
}

// ── MCP pool coordination ───────────────────────────────────────────────

const MCP_POOL_PREFIX = "mcp-pool:";
const MCP_POOL_TTL = 600; // 10 minutes

export interface MCPPoolEntry {
  serverId: string;
  url: string;
  transport: string;
  connectedAt: string;
  lastUsedAt: string;
}

/**
 * Register an MCP connection in Redis for cross-replica visibility.
 */
export async function registerMCPConnection(entry: MCPPoolEntry): Promise<void> {
  await cacheSet(
    `${MCP_POOL_PREFIX}${entry.serverId}`,
    JSON.stringify(entry),
    MCP_POOL_TTL
  );
}

/**
 * Get MCP connection info from Redis.
 */
export async function getMCPConnection(serverId: string): Promise<MCPPoolEntry | null> {
  const data = await cacheGet(`${MCP_POOL_PREFIX}${serverId}`);
  if (!data) return null;
  try {
    return JSON.parse(data) as MCPPoolEntry;
  } catch {
    return null;
  }
}

/**
 * Remove an MCP connection from Redis (on disconnect/eviction).
 */
export async function removeMCPConnection(serverId: string): Promise<void> {
  await cacheDel(`${MCP_POOL_PREFIX}${serverId}`);
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
