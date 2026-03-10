interface RateLimitEntry {
  timestamps: number[];
}

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;
const CLEANUP_INTERVAL_MS = 60_000;

const globalForRateLimit = globalThis as unknown as {
  rateLimitStore?: Map<string, RateLimitEntry>;
  rateLimitTimer?: ReturnType<typeof setInterval>;
};

const store = globalForRateLimit.rateLimitStore ?? new Map<string, RateLimitEntry>();
globalForRateLimit.rateLimitStore = store;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function checkRateLimit(key: string, maxRequests: number = MAX_REQUESTS): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key) ?? { timestamps: [] };

  entry.timestamps = entry.timestamps.filter((t) => now - t < WINDOW_MS);

  if (entry.timestamps.length >= maxRequests) {
    const oldestInWindow = entry.timestamps[0];
    const retryAfterMs = WINDOW_MS - (now - oldestInWindow);
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  entry.timestamps.push(now);
  store.set(key, entry);

  return {
    allowed: true,
    remaining: maxRequests - entry.timestamps.length,
    retryAfterMs: 0,
  };
}

function startCleanup(): void {
  if (globalForRateLimit.rateLimitTimer) return;
  if (typeof setInterval === "undefined") return;

  globalForRateLimit.rateLimitTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      entry.timestamps = entry.timestamps.filter((t) => now - t < WINDOW_MS);
      if (entry.timestamps.length === 0) store.delete(key);
    }
  }, CLEANUP_INTERVAL_MS);
}

export function stopCleanup(): void {
  if (globalForRateLimit.rateLimitTimer) {
    clearInterval(globalForRateLimit.rateLimitTimer);
    globalForRateLimit.rateLimitTimer = undefined;
  }
  store.clear();
}

startCleanup();
