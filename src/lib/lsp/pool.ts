/**
 * LSP Connection Pool — Phase F1
 *
 * Manages a bounded pool of LspClient instances (one per language, up to
 * MAX_LSP_CONNECTIONS total).  Each client is kept alive across requests
 * to avoid the 30s initialize overhead on every node execution.
 *
 * Pool behaviour:
 * - First request for a language spawns + initialises a new client.
 * - Subsequent requests reuse the existing client.
 * - On shutdown (or test teardown) `drainLspPool()` sends shutdown/exit
 *   to all live clients.
 * - If the client process crashes between calls, the pool evicts it and
 *   spawns a fresh one on the next request.
 */

import path from "node:path";
import { logger } from "@/lib/logger";
import { LspClient } from "./lsp-client";
import type { LspLanguage } from "./types";
import { LSP_SERVER_CONFIGS } from "./types";

export const MAX_LSP_CONNECTIONS = 3;

/** Allowed root prefixes for LSP workspace URIs. */
const ALLOWED_ROOT_PREFIXES = ["/tmp/", "/tmp/agent-"];

/**
 * Validates that the given rootUri is a safe path for LSP to use as its
 * workspace root.  Blocks directory traversal and access outside /tmp/.
 *
 * @returns The normalised rootUri (file:// scheme) or throws.
 */
export function validateWorkspacePath(rootUri: string): string {
  // Strip file:// prefix to get raw path
  const rawPath = rootUri.startsWith("file://") ? rootUri.slice(7) : rootUri;
  const normalised = path.resolve("/", rawPath);

  // Block traversal (.. in path that escapes /tmp)
  if (normalised !== rawPath && rawPath.includes("..")) {
    throw new Error(`LSP workspace path traversal blocked: ${rawPath}`);
  }

  // Must be /tmp or start with /tmp/
  const allowed = normalised === "/tmp" || ALLOWED_ROOT_PREFIXES.some((prefix) => normalised.startsWith(prefix));
  if (!allowed) {
    throw new Error(`LSP workspace path outside allowed roots: ${normalised}`);
  }

  return `file://${normalised}`;
}

interface PoolEntry {
  client: LspClient;
  language: LspLanguage;
  createdAt: number;
}

const pool = new Map<LspLanguage, PoolEntry>();

/**
 * Acquire an initialised LspClient for the requested language.
 * If the pool already has a live client for this language it is returned
 * directly.  Otherwise a new client is spawned and initialised.
 *
 * Throws if the LSP server binary is not found or the initialise handshake
 * times out.
 */
export async function acquireLspClient(
  language: LspLanguage,
  rootUri = "file:///tmp",
): Promise<LspClient> {
  // Validate workspace path before using it
  const safeRootUri = validateWorkspacePath(rootUri);

  // Return existing live client
  const existing = pool.get(language);
  if (existing && !existing.client.closed) {
    return existing.client;
  }

  // Evict dead entry if present
  if (existing) {
    pool.delete(language);
  }

  // Enforce pool size cap — evict the oldest entry
  if (pool.size >= MAX_LSP_CONNECTIONS) {
    let oldest: [LspLanguage, PoolEntry] | undefined;
    for (const entry of pool.entries()) {
      if (!oldest || entry[1].createdAt < oldest[1].createdAt) {
        oldest = entry;
      }
    }
    if (oldest) {
      logger.info("LSP pool evicting oldest client", { language: oldest[0] });
      oldest[1].client.shutdown().catch(() => undefined);
      pool.delete(oldest[0]);
    }
  }

  const config = LSP_SERVER_CONFIGS[language];
  const client = new LspClient(config);

  try {
    await client.initialize(safeRootUri);
  } catch (err) {
    client.shutdown().catch(() => undefined);
    throw err;
  }

  pool.set(language, { client, language, createdAt: Date.now() });
  logger.info("LSP pool: new client added", { language, poolSize: pool.size });

  return client;
}

/**
 * Gracefully shut down all pooled LSP clients.
 * Call this on process exit or in test teardown.
 */
export async function drainLspPool(): Promise<void> {
  const shutdowns = [...pool.values()].map((entry) =>
    entry.client.shutdown().catch(() => undefined),
  );
  pool.clear();
  await Promise.all(shutdowns);
  logger.info("LSP pool drained");
}

/** Returns the current pool size (for testing / monitoring). */
export function getLspPoolSize(): number {
  return pool.size;
}

/** Clears the pool without sending shutdown (for testing only). */
export function clearLspPool(): void {
  pool.clear();
}
