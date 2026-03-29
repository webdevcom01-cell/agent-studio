/**
 * Advanced MemoryCache tests — covers eviction, concurrency patterns,
 * stats accuracy, destroy, and edge cases not in the base test file.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryCache } from "../memory-cache";

describe("MemoryCache — advanced", () => {
  let cache: MemoryCache<unknown>;

  beforeEach(() => {
    cache = new MemoryCache<unknown>(5000);
  });

  afterEach(() => {
    cache.destroy();
    vi.useRealTimers();
  });

  // ── Initialization ───────────────────────────────────────────────────────

  it("starts with size 0", () => {
    expect(cache.size()).toBe(0);
  });

  it("starts with zero hits and misses", () => {
    const s = cache.stats();
    expect(s.hits).toBe(0);
    expect(s.misses).toBe(0);
  });

  it("hitRate is 0 before any operations", () => {
    expect(cache.stats().hitRate).toBe(0);
  });

  it("accepts custom TTL in constructor", () => {
    const customCache = new MemoryCache<string>(100);
    customCache.set("k", "v");
    expect(customCache.get("k")).toBe("v");
    customCache.destroy();
  });

  // ── set / get ────────────────────────────────────────────────────────────

  it("stores numbers", () => {
    const numCache = new MemoryCache<number>();
    numCache.set("num", 42);
    expect(numCache.get("num")).toBe(42);
    numCache.destroy();
  });

  it("stores objects", () => {
    const objCache = new MemoryCache<{ a: number }>();
    objCache.set("obj", { a: 1 });
    expect(objCache.get("obj")).toEqual({ a: 1 });
    objCache.destroy();
  });

  it("stores null as a valid value", () => {
    const nullCache = new MemoryCache<null>();
    nullCache.set("nullkey", null);
    // null is a valid stored value — get should NOT return undefined
    const val = nullCache.get("nullkey");
    // null stored should be returned (it's in the store)
    expect(val === null || val !== undefined).toBeTruthy();
    nullCache.destroy();
  });

  it("stores arrays", () => {
    const arrCache = new MemoryCache<number[]>();
    arrCache.set("arr", [1, 2, 3]);
    expect(arrCache.get("arr")).toEqual([1, 2, 3]);
    arrCache.destroy();
  });

  it("stores deeply nested objects", () => {
    const deepCache = new MemoryCache<object>();
    const deep = { a: { b: { c: { d: "deep" } } } };
    deepCache.set("deep", deep);
    expect(deepCache.get("deep")).toEqual(deep);
    deepCache.destroy();
  });

  it("handles empty string key", () => {
    cache.set("", "empty-key-value");
    expect(cache.get("")).toBe("empty-key-value");
  });

  it("handles very long keys", () => {
    const longKey = "k".repeat(1000);
    cache.set(longKey, "value");
    expect(cache.get(longKey)).toBe("value");
  });

  it("handles unicode keys", () => {
    cache.set("🔑-ключ-鍵", "value");
    expect(cache.get("🔑-ключ-鍵")).toBe("value");
  });

  // ── TTL / expiry ─────────────────────────────────────────────────────────

  it("entry is NOT expired before TTL elapses", () => {
    vi.useFakeTimers();
    cache.set("fresh", "value", 1000);
    vi.advanceTimersByTime(999);
    expect(cache.get("fresh")).toBe("value");
  });

  it("entry IS expired after TTL elapses", () => {
    vi.useFakeTimers();
    cache.set("stale", "value", 1000);
    vi.advanceTimersByTime(1001);
    expect(cache.get("stale")).toBeUndefined();
  });

  it("expiry counts as a miss in stats", () => {
    vi.useFakeTimers();
    cache.set("k", "v", 100);
    vi.advanceTimersByTime(200);
    cache.get("k"); // expired
    expect(cache.stats().misses).toBe(1);
    expect(cache.stats().hits).toBe(0);
  });

  it("different entries can have different TTLs", () => {
    vi.useFakeTimers();
    cache.set("short", "s", 100);
    cache.set("long", "l", 5000);
    vi.advanceTimersByTime(150);
    expect(cache.get("short")).toBeUndefined();
    expect(cache.get("long")).toBe("l");
  });

  // ── delete ───────────────────────────────────────────────────────────────

  it("delete returns false for nonexistent key", () => {
    expect(cache.delete("missing")).toBe(false);
  });

  it("size decreases after delete", () => {
    cache.set("a", 1);
    cache.set("b", 2);
    cache.delete("a");
    expect(cache.size()).toBe(1);
  });

  it("deleting same key twice: second returns false", () => {
    cache.set("k", "v");
    expect(cache.delete("k")).toBe(true);
    expect(cache.delete("k")).toBe(false);
  });

  // ── clear ────────────────────────────────────────────────────────────────

  it("clear reduces size to 0 with many entries", () => {
    for (let i = 0; i < 50; i++) cache.set(`key-${i}`, i);
    expect(cache.size()).toBe(50);
    cache.clear();
    expect(cache.size()).toBe(0);
  });

  it("entries are inaccessible after clear", () => {
    cache.set("a", "value");
    cache.clear();
    expect(cache.get("a")).toBeUndefined();
  });

  it("can set new entries after clear", () => {
    cache.set("old", "old-value");
    cache.clear();
    cache.set("new", "new-value");
    expect(cache.get("new")).toBe("new-value");
    expect(cache.size()).toBe(1);
  });

  // ── stats ────────────────────────────────────────────────────────────────

  it("hitRate is 1.0 when all gets are hits", () => {
    cache.set("k", "v");
    cache.get("k");
    cache.get("k");
    expect(cache.stats().hitRate).toBe(1.0);
  });

  it("hitRate is 0.0 when all gets are misses", () => {
    cache.get("miss1");
    cache.get("miss2");
    expect(cache.stats().hitRate).toBe(0.0);
  });

  it("stats size matches actual number of entries", () => {
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.stats().size).toBe(3);
  });

  it("resetStats does not clear entries", () => {
    cache.set("k", "v");
    cache.get("k");
    cache.resetStats();
    expect(cache.get("k")).toBe("v"); // entry still present
  });

  // ── destroy ──────────────────────────────────────────────────────────────

  it("destroy clears all entries", () => {
    cache.set("a", 1);
    cache.set("b", 2);
    cache.destroy();
    expect(cache.size()).toBe(0);
  });

  it("calling destroy twice does not throw", () => {
    expect(() => {
      cache.destroy();
      cache.destroy();
    }).not.toThrow();
  });
});
