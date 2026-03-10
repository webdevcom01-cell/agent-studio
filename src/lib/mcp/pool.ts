import { createMCPClient } from "@ai-sdk/mcp";
import type { MCPTransport as MCPTransportType } from "@/generated/prisma";
import { logger } from "@/lib/logger";

interface PoolEntry {
  client: Awaited<ReturnType<typeof createMCPClient>>;
  lastUsed: number;
}

const IDLE_TTL_MS = 5 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;
const MAX_POOL_SIZE = 50;

const pool = new Map<string, PoolEntry>();
const inflight = new Map<string, Promise<PoolEntry["client"]>>();
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function buildTransportConfig(
  url: string,
  transport: MCPTransportType,
  headers?: Record<string, string>,
): { type: "sse" | "http"; url: string; headers?: Record<string, string> } {
  const type = transport === "SSE" ? "sse" : "http";
  return headers ? { type, url, headers } : { type, url };
}

function evictLRU(): void {
  if (pool.size < MAX_POOL_SIZE) return;

  let oldestId: string | null = null;
  let oldestTime = Infinity;

  for (const [id, entry] of pool) {
    if (entry.lastUsed < oldestTime) {
      oldestTime = entry.lastUsed;
      oldestId = id;
    }
  }

  if (oldestId) {
    const entry = pool.get(oldestId);
    if (entry) {
      entry.client.close().catch((err) => {
        logger.warn("Failed to close evicted MCP client", { serverId: oldestId, error: String(err) });
      });
    }
    pool.delete(oldestId);
  }
}

function startCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of pool) {
      if (now - entry.lastUsed > IDLE_TTL_MS) {
        entry.client.close().catch((err) => {
          logger.warn("Failed to close idle MCP client", { serverId: id, error: String(err) });
        });
        pool.delete(id);
      }
    }
    if (pool.size === 0 && cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  }, CLEANUP_INTERVAL_MS);
}

export async function getOrCreate(
  serverId: string,
  url: string,
  transport: MCPTransportType,
  headers?: Record<string, string>,
): Promise<PoolEntry["client"]> {
  const existing = pool.get(serverId);
  if (existing) {
    try {
      await existing.client.tools();
      existing.lastUsed = Date.now();
      return existing.client;
    } catch {
      logger.warn("MCP pool evicting dead connection", { serverId });
      existing.client.close().catch(() => {});
      pool.delete(serverId);
    }
  }

  const pending = inflight.get(serverId);
  if (pending) {
    return pending;
  }

  evictLRU();

  const promise = (async (): Promise<PoolEntry["client"]> => {
    const transportConfig = buildTransportConfig(url, transport, headers);
    const client = await createMCPClient({ transport: transportConfig });
    pool.set(serverId, { client, lastUsed: Date.now() });
    startCleanup();
    return client;
  })();

  inflight.set(serverId, promise);

  try {
    return await promise;
  } finally {
    inflight.delete(serverId);
  }
}

export async function remove(serverId: string): Promise<void> {
  const entry = pool.get(serverId);
  if (entry) {
    await entry.client.close().catch((err) => {
      logger.warn("Failed to close removed MCP client", { serverId, error: String(err) });
    });
    pool.delete(serverId);
  }
}

export function getPoolSize(): number {
  return pool.size;
}

export function clearPool(): void {
  for (const [id, entry] of pool) {
    entry.client.close().catch((err) => {
      logger.warn("Failed to close MCP client during pool clear", { serverId: id, error: String(err) });
    });
  }
  pool.clear();
  inflight.clear();
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

function handleShutdown(): void {
  logger.info("MCP pool shutdown triggered");
  clearPool();
}

process.on("SIGTERM", handleShutdown);
process.on("SIGINT", handleShutdown);
