const MAX_CALLS_PER_MINUTE = 60;

const callCounts = new Map<string, number[]>();

export function checkRateLimit(
  userId: string,
  calleeAgentId: string
): void {
  const key = `${userId}:${calleeAgentId}`;
  const now = Date.now();
  const windowStart = now - 60_000;

  const timestamps = (callCounts.get(key) ?? []).filter(
    (t) => t > windowStart
  );
  timestamps.push(now);
  callCounts.set(key, timestamps);

  if (timestamps.length > MAX_CALLS_PER_MINUTE) {
    throw new Error(
      `Rate limit exceeded: max ${MAX_CALLS_PER_MINUTE} calls/min to agent ${calleeAgentId}`
    );
  }
}

export function resetRateLimits(): void {
  callCounts.clear();
}
