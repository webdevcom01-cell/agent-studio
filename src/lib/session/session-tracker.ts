/**
 * Concurrent Session Tracker — limits active sessions per user.
 *
 * Uses Redis for cross-replica tracking. Falls back to allowing
 * all sessions when Redis is unavailable (fail-open).
 *
 * Max concurrent sessions: 5 per user.
 * Session TTL: 24 hours (matches JWT maxAge).
 */

import { cacheGet, cacheSet, cacheDel, getRedis } from "@/lib/redis";
import { logger } from "@/lib/logger";

const MAX_SESSIONS = 5;
const SESSION_TTL_SECONDS = 86400;
const SESSION_PREFIX = "active-session:";

interface SessionEntry {
  sessionId: string;
  userAgent: string;
  ip: string;
  createdAt: string;
}

/**
 * Register a new session. If user has >= MAX_SESSIONS, evicts the oldest.
 */
export async function registerSession(
  userId: string,
  sessionId: string,
  userAgent: string,
  ip: string,
): Promise<{ allowed: boolean; evicted?: string }> {
  const key = `${SESSION_PREFIX}${userId}`;

  try {
    const existing = await loadSessions(key);

    if (existing.length >= MAX_SESSIONS) {
      // Evict oldest session
      const sorted = existing.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      const evicted = sorted[0];
      const remaining = sorted.slice(1);

      const updated = [
        ...remaining,
        { sessionId, userAgent, ip, createdAt: new Date().toISOString() },
      ];

      await saveSessions(key, updated);

      logger.info("Session evicted (max concurrent limit)", {
        userId,
        evictedSessionId: evicted.sessionId,
        activeCount: updated.length,
      });

      return { allowed: true, evicted: evicted.sessionId };
    }

    const updated = [
      ...existing.filter((s) => s.sessionId !== sessionId),
      { sessionId, userAgent, ip, createdAt: new Date().toISOString() },
    ];

    await saveSessions(key, updated);
    return { allowed: true };
  } catch {
    // Redis unavailable — allow through
    return { allowed: true };
  }
}

export async function removeSession(
  userId: string,
  sessionId: string,
): Promise<void> {
  const key = `${SESSION_PREFIX}${userId}`;

  try {
    const existing = await loadSessions(key);
    const updated = existing.filter((s) => s.sessionId !== sessionId);
    await saveSessions(key, updated);
  } catch {
    // Best effort
  }
}

export async function revokeAllSessions(userId: string): Promise<number> {
  const key = `${SESSION_PREFIX}${userId}`;

  try {
    const existing = await loadSessions(key);
    const count = existing.length;
    await cacheDel(key);
    logger.info("All sessions revoked", { userId, count });
    return count;
  } catch {
    return 0;
  }
}

export async function getActiveSessions(
  userId: string,
): Promise<SessionEntry[]> {
  const key = `${SESSION_PREFIX}${userId}`;
  return loadSessions(key);
}

async function loadSessions(key: string): Promise<SessionEntry[]> {
  const data = await cacheGet(key);
  if (!data) return [];
  try {
    return JSON.parse(data) as SessionEntry[];
  } catch {
    return [];
  }
}

async function saveSessions(
  key: string,
  sessions: SessionEntry[],
): Promise<void> {
  await cacheSet(key, JSON.stringify(sessions), SESSION_TTL_SECONDS);
}

export { MAX_SESSIONS };
