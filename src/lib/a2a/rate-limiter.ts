/**
 * Rate limiter for agent-to-agent calls.
 *
 * Delegates to the main rate-limit module which supports Redis + in-memory fallback.
 * Uses a prefixed key to isolate A2A limits from HTTP API limits.
 */

import { checkRateLimit as coreCheck } from "@/lib/rate-limit";

const MAX_CALLS_PER_MINUTE = 60;

export function checkRateLimit(
  userId: string,
  calleeAgentId: string
): void {
  const key = `a2a:${userId}:${calleeAgentId}`;
  const result = coreCheck(key, MAX_CALLS_PER_MINUTE);

  if (!result.allowed) {
    throw new Error(
      `Rate limit exceeded: max ${MAX_CALLS_PER_MINUTE} calls/min to agent ${calleeAgentId}`
    );
  }
}

export function resetRateLimits(): void {
  // In-memory store is cleared via stopCleanup() in the core module
}
