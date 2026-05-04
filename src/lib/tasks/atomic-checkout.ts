import { getRedis } from "@/lib/redis";
import { logger } from "@/lib/logger";

export interface TaskCheckout {
  taskId: string;
  agentId: string;
  sessionId: string;
  checkedOutAt: Date;
  expiresAt: Date;
  ttlSeconds: number;
}

const LOCK_PREFIX = "task:lock:";
const CHECKOUT_PREFIX = "task:checkout:";

interface StoredCheckout {
  taskId: string;
  agentId: string;
  sessionId: string;
  checkedOutAt: string;
  expiresAt: string;
  ttlSeconds: number;
}

function lockKey(taskId: string): string {
  return `${LOCK_PREFIX}${taskId}`;
}

function checkoutKey(agentId: string, taskId: string): string {
  return `${CHECKOUT_PREFIX}${agentId}:${taskId}`;
}

function parseCheckout(raw: string): TaskCheckout | null {
  try {
    const data = JSON.parse(raw) as StoredCheckout;
    return {
      ...data,
      checkedOutAt: new Date(data.checkedOutAt),
      expiresAt: new Date(data.expiresAt),
    };
  } catch {
    return null;
  }
}

/**
 * Atomically acquire a lock on a task using SET NX EX.
 * Returns checkout record on success, null if already locked.
 */
export async function checkoutTask(
  taskId: string,
  agentId: string,
  sessionId: string,
  ttlSeconds = 300,
): Promise<TaskCheckout | null> {
  const redis = await getRedis();
  if (!redis) {
    logger.warn("checkoutTask: Redis unavailable — checkout skipped", { taskId, agentId });
    return null;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  const checkout: StoredCheckout = {
    taskId,
    agentId,
    sessionId,
    checkedOutAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ttlSeconds,
  };

  const value = JSON.stringify(checkout);
  const lk = lockKey(taskId);
  const ck = checkoutKey(agentId, taskId);

  try {
    const result = await redis.set(lk, value, "NX", "EX", ttlSeconds);
    if (result !== "OK") return null;

    // Secondary index so getAgentCheckouts can find tasks by agent
    await redis.set(ck, value, "EX", ttlSeconds);

    logger.info("Task checked out", { taskId, agentId, sessionId, ttlSeconds });

    return { taskId, agentId, sessionId, checkedOutAt: now, expiresAt, ttlSeconds };
  } catch (error) {
    logger.error("checkoutTask error", { taskId, agentId, error });
    return null;
  }
}

const RENEW_SCRIPT = `
local val = redis.call('GET', KEYS[1])
if val == false then return 0 end
local data = cjson.decode(val)
if data.agentId ~= ARGV[1] or data.sessionId ~= ARGV[2] then return 0 end
local ttl = tonumber(ARGV[3])
redis.call('EXPIRE', KEYS[1], ttl)
redis.call('EXPIRE', KEYS[2], ttl)
return 1
`;

/**
 * Extend the TTL on an existing lock. Only the owning agent can renew.
 */
export async function renewCheckout(
  taskId: string,
  agentId: string,
  sessionId: string,
  ttlSeconds = 300,
): Promise<boolean> {
  const redis = await getRedis();
  if (!redis) return false;

  try {
    const lk = lockKey(taskId);
    const ck = checkoutKey(agentId, taskId);
    const result = await redis.eval(RENEW_SCRIPT, 2, lk, ck, agentId, sessionId, ttlSeconds);
    return result === 1;
  } catch (error) {
    logger.error("renewCheckout error", { taskId, agentId, error });
    return false;
  }
}

const RELEASE_SCRIPT = `
local val = redis.call('GET', KEYS[1])
if val == false then return 0 end
local data = cjson.decode(val)
if data.agentId ~= ARGV[1] or data.sessionId ~= ARGV[2] then return 0 end
redis.call('DEL', KEYS[1])
redis.call('DEL', KEYS[2])
return 1
`;

/**
 * Release a task lock atomically. Only the owner can release.
 */
export async function releaseCheckout(
  taskId: string,
  agentId: string,
  sessionId: string,
): Promise<boolean> {
  const redis = await getRedis();
  if (!redis) return false;

  try {
    const lk = lockKey(taskId);
    const ck = checkoutKey(agentId, taskId);
    const result = await redis.eval(RELEASE_SCRIPT, 2, lk, ck, agentId, sessionId);
    const released = result === 1;
    if (released) {
      logger.info("Task checkout released", { taskId, agentId, sessionId });
    }
    return released;
  } catch (error) {
    logger.error("releaseCheckout error", { taskId, agentId, error });
    return false;
  }
}

/**
 * Get current checkout status of a task. Returns null if not checked out.
 */
export async function getCheckout(taskId: string): Promise<TaskCheckout | null> {
  const redis = await getRedis();
  if (!redis) return null;

  try {
    const raw = await redis.get(lockKey(taskId));
    if (!raw) return null;
    return parseCheckout(raw);
  } catch (error) {
    logger.error("getCheckout error", { taskId, error });
    return null;
  }
}

/**
 * Get all tasks currently checked out by an agent.
 * Uses key pattern task:checkout:{agentId}:* to find all agent checkouts.
 */
export async function getAgentCheckouts(agentId: string): Promise<TaskCheckout[]> {
  const redis = await getRedis();
  if (!redis) return [];

  try {
    const pattern = `${CHECKOUT_PREFIX}${agentId}:*`;
    const allKeys: string[] = [];
    let cursor = 0;
    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = parseInt(nextCursor, 10);
      allKeys.push(...keys);
    } while (cursor !== 0);

    if (allKeys.length === 0) return [];

    const results: TaskCheckout[] = [];
    for (const key of allKeys) {
      const raw = await redis.get(key);
      if (raw) {
        const checkout = parseCheckout(raw);
        if (checkout) results.push(checkout);
      }
    }
    return results;
  } catch (error) {
    logger.error("getAgentCheckouts error", { agentId, error });
    return [];
  }
}

/**
 * Admin-only force release of a lock without ownership validation.
 */
export async function forceRelease(taskId: string): Promise<boolean> {
  const redis = await getRedis();
  if (!redis) return false;

  try {
    const lk = lockKey(taskId);

    // Read lock to find the checkout index key for cleanup
    const raw = await redis.get(lk);
    let ck: string | null = null;
    if (raw) {
      const parsed = parseCheckout(raw);
      if (parsed) {
        ck = checkoutKey(parsed.agentId, taskId);
      }
    }

    const keysToDelete = ck ? [lk, ck] : [lk];
    const deleted = await redis.del(...keysToDelete);

    logger.info("Task checkout force-released", { taskId, deleted });
    return deleted > 0;
  } catch (error) {
    logger.error("forceRelease error", { taskId, error });
    return false;
  }
}
