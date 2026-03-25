import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryCache } from "../memory-cache";

describe("MemoryCache", () => {
  let cache: MemoryCache<string>;

  beforeEach(() => {
    cache = new MemoryCache<string>(1000);
  });

  afterEach(() => {
    cache.destroy();
  });

  it("stores and retrieves values", () => {
    cache.set("key1", "value1");
    expect(cache.get("key1")).toBe("value1");
  });

  it("returns undefined for missing keys", () => {
    expect(cache.get("nonexistent")).toBeUndefined();
  });

  it("expires entries after TTL", () => {
    vi.useFakeTimers();
    cache.set("expiring", "value", 500);
    expect(cache.get("expiring")).toBe("value");

    vi.advanceTimersByTime(600);
    expect(cache.get("expiring")).toBeUndefined();
    vi.useRealTimers();
  });

  it("deletes entries", () => {
    cache.set("deleteme", "value");
    expect(cache.delete("deleteme")).toBe(true);
    expect(cache.get("deleteme")).toBeUndefined();
  });

  it("clears all entries", () => {
    cache.set("a", "1");
    cache.set("b", "2");
    cache.clear();
    expect(cache.size()).toBe(0);
  });

  it("tracks hit/miss stats", () => {
    cache.set("hit", "value");
    cache.get("hit");
    cache.get("miss");

    const stats = cache.stats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBe(0.5);
  });

  it("resets stats", () => {
    cache.set("x", "y");
    cache.get("x");
    cache.get("z");
    cache.resetStats();

    const stats = cache.stats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
  });

  it("reports size correctly", () => {
    cache.set("a", "1");
    cache.set("b", "2");
    cache.set("c", "3");
    expect(cache.size()).toBe(3);
  });

  it("overwrites existing keys", () => {
    cache.set("key", "old");
    cache.set("key", "new");
    expect(cache.get("key")).toBe("new");
    expect(cache.size()).toBe(1);
  });

  it("allows custom TTL per entry", () => {
    vi.useFakeTimers();
    cache.set("short", "value", 100);
    cache.set("long", "value", 5000);

    vi.advanceTimersByTime(200);
    expect(cache.get("short")).toBeUndefined();
    expect(cache.get("long")).toBe("value");
    vi.useRealTimers();
  });

  it("hitRate is 0 when no operations", () => {
    expect(cache.stats().hitRate).toBe(0);
  });
});
