import { createMCPClient } from "@ai-sdk/mcp";
import type { MCPTransport as MCPTransportType } from "@/generated/prisma";

interface PoolEntry {
  client: Awaited<ReturnType<typeof createMCPClient>>;
  lastUsed: number;
}

const IDLE_TTL_MS = 5 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;

const pool = new Map<string, PoolEntry>();
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function buildTransportConfig(
  url: string,
  transport: MCPTransportType,
  headers?: Record<string, string>,
): { type: "sse" | "http"; url: string; headers?: Record<string, string> } {
  const type = transport === "SSE" ? "sse" : "http";
  return headers ? { type, url, headers } : { type, url };
}

function startCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of pool) {
      if (now - entry.lastUsed > IDLE_TTL_MS) {
        entry.client.close().catch(() => {});
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
    existing.lastUsed = Date.now();
    return existing.client;
  }

  const transportConfig = buildTransportConfig(url, transport, headers);
  const client = await createMCPClient({ transport: transportConfig });

  pool.set(serverId, { client, lastUsed: Date.now() });
  startCleanup();

  return client;
}

export async function remove(serverId: string): Promise<void> {
  const entry = pool.get(serverId);
  if (entry) {
    await entry.client.close().catch(() => {});
    pool.delete(serverId);
  }
}

export function getPoolSize(): number {
  return pool.size;
}

export function clearPool(): void {
  for (const [, entry] of pool) {
    entry.client.close().catch(() => {});
  }
  pool.clear();
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
