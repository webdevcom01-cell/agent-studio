/**
 * Lightweight in-memory TTL cache.
 *
 * Designed for single-replica Railway deployment. For multi-replica
 * scaling, replace with Redis (see scaling runbook in docs/).
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;
const MAX_ENTRIES = 10_000;

export class MemoryCache<T = unknown> {
  private store = new Map<string, CacheEntry<T>>();
  private hits = 0;
  private misses = 0;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly defaultTtlMs: number = DEFAULT_TTL_MS) {
    this.cleanupTimer = setInterval(() => this.evictExpired(), CLEANUP_INTERVAL_MS);
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.misses++;
      return undefined;
    }
    this.hits++;
    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    if (this.store.size >= MAX_ENTRIES) {
      this.evictOldest();
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }

  stats(): { hits: number; misses: number; hitRate: number; size: number } {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      size: this.store.size,
    };
  }

  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.store.clear();
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }

  private evictOldest(): void {
    const firstKey = this.store.keys().next().value;
    if (firstKey !== undefined) {
      this.store.delete(firstKey);
    }
  }
}
