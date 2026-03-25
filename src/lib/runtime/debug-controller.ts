/**
 * Debug Session Controller — Phase 6
 *
 * Manages pause/resume state for breakpoint-based step execution.
 * Uses Redis for cross-replica coordination (Railway: 2 replicas).
 * Falls back to in-memory Map when Redis is unavailable.
 *
 * State machine per session:
 *   idle → paused (breakpoint hit) → running (resume/step/stop)
 *
 * Redis key: debug:session:{sessionId}:cmd  TTL: 5 min
 * Values: "paused" | "continue" | "step" | "stop"
 */

import { getRedis } from "@/lib/redis";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KEY_PREFIX = "debug:session:";
const KEY_TTL_S = 300; // 5 minutes
const POLL_INTERVAL_MS = 150; // how often engine polls for resume command
const MAX_PAUSE_MS = 60_000; // 60s max pause before auto-continue

export type DebugCommand = "paused" | "continue" | "step" | "stop";

// ---------------------------------------------------------------------------
// In-memory fallback (single-replica / dev)
// ---------------------------------------------------------------------------

const inMemoryStore = new Map<string, DebugCommand>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Called by the engine before starting a debug run. Creates the session key. */
export async function initDebugSession(sessionId: string): Promise<void> {
  const redis = await getRedis();
  if (redis) {
    await redis.set(`${KEY_PREFIX}${sessionId}:cmd`, "paused", "EX", KEY_TTL_S);
  } else {
    inMemoryStore.set(sessionId, "paused");
  }
}

/**
 * Called by the API control endpoint.
 * Sets the command so the waiting engine loop can proceed.
 */
export async function sendDebugCommand(
  sessionId: string,
  command: "continue" | "step" | "stop"
): Promise<boolean> {
  const redis = await getRedis();
  if (redis) {
    const result = await redis.set(
      `${KEY_PREFIX}${sessionId}:cmd`,
      command,
      "EX",
      KEY_TTL_S
    );
    return result === "OK";
  } else {
    if (!inMemoryStore.has(sessionId)) return false;
    inMemoryStore.set(sessionId, command);
    return true;
  }
}

/**
 * Called by the engine when it hits a breakpoint node.
 * Blocks until the user sends "continue", "step", or "stop"
 * (or until MAX_PAUSE_MS elapses → auto-continues).
 *
 * Returns the command that unblocked execution.
 */
export async function waitForDebugResume(
  sessionId: string,
  abortSignal?: AbortSignal
): Promise<"continue" | "step" | "stop"> {
  const redis = await getRedis();
  const key = `${KEY_PREFIX}${sessionId}:cmd`;

  // First, mark as paused
  if (redis) {
    await redis.set(key, "paused", "EX", KEY_TTL_S);
  } else {
    inMemoryStore.set(sessionId, "paused");
  }

  const deadline = Date.now() + MAX_PAUSE_MS;

  while (Date.now() < deadline) {
    // Check for abort (stream disconnected)
    if (abortSignal?.aborted) return "stop";

    // Poll for command
    let cmd: string | null = null;
    if (redis) {
      cmd = await redis.get(key);
    } else {
      cmd = inMemoryStore.get(sessionId) ?? null;
    }

    if (cmd && cmd !== "paused") {
      // Consume the command — reset to paused so next breakpoint works
      if (redis) {
        await redis.set(key, "paused", "EX", KEY_TTL_S);
      } else {
        inMemoryStore.set(sessionId, "paused");
      }
      return cmd as "continue" | "step" | "stop";
    }

    // Wait before polling again
    await sleep(POLL_INTERVAL_MS);
  }

  // Timeout — auto-continue so flow doesn't hang forever
  return "continue";
}

/** Clean up session state (call when flow finishes or aborts). */
export async function cleanupDebugSession(sessionId: string): Promise<void> {
  const redis = await getRedis();
  if (redis) {
    await redis.del(`${KEY_PREFIX}${sessionId}:cmd`);
  } else {
    inMemoryStore.delete(sessionId);
  }
}

/** Check if a session is currently active (for the control API to validate). */
export async function isDebugSessionActive(sessionId: string): Promise<boolean> {
  const redis = await getRedis();
  if (redis) {
    // Use get() — returns null if key doesn't exist or has expired
    const value = await redis.get(`${KEY_PREFIX}${sessionId}:cmd`);
    return value !== null;
  } else {
    return inMemoryStore.has(sessionId);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
