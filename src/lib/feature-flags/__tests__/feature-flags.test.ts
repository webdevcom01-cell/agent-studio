import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/redis", () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
  cacheDel: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  isFeatureEnabled,
  getAllFlags,
  setFlagOverride,
  DEFAULT_FLAGS,
} from "../index";
import { cacheGet } from "@/lib/redis";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isFeatureEnabled", () => {
  it("returns false for unknown flag", async () => {
    expect(await isFeatureEnabled("nonexistent")).toBe(false);
  });

  it("returns true for enabled flag with 100% rollout", async () => {
    expect(await isFeatureEnabled("webhook-retry")).toBe(true);
  });

  it("returns false for disabled flag with 0% rollout", async () => {
    expect(await isFeatureEnabled("async-execution")).toBe(false);
  });

  it("uses Redis override when present", async () => {
    vi.mocked(cacheGet).mockResolvedValueOnce(JSON.stringify({ enabled: true }));

    const result = await isFeatureEnabled("async-execution");
    expect(result).toBe(true);
  });

  it("uses org override over Redis override", async () => {
    // First call: org override check
    vi.mocked(cacheGet).mockResolvedValueOnce(JSON.stringify({ enabled: false }));

    const result = await isFeatureEnabled("webhook-retry", { orgId: "org-1" });
    expect(result).toBe(false);
  });

  it("percentage rollout is deterministic per user", async () => {
    // Manually test with a flag that has partial rollout
    // The simpleHash should return consistent results
    const result1 = await isFeatureEnabled("safety-middleware", { userId: "user-1" });
    const result2 = await isFeatureEnabled("safety-middleware", { userId: "user-1" });
    expect(result1).toBe(result2);
  });
});

describe("getAllFlags", () => {
  it("returns all default flags", () => {
    const flags = getAllFlags();
    expect(flags.length).toBe(Object.keys(DEFAULT_FLAGS).length);
    expect(flags.length).toBeGreaterThanOrEqual(5);
  });

  it("each flag has required fields", () => {
    for (const flag of getAllFlags()) {
      expect(flag.key).toBeTruthy();
      expect(typeof flag.enabled).toBe("boolean");
      expect(typeof flag.rolloutPercent).toBe("number");
      expect(flag.description).toBeTruthy();
    }
  });
});

describe("setFlagOverride", () => {
  it("persists override to Redis", async () => {
    const { cacheSet } = await import("@/lib/redis");

    await setFlagOverride("async-execution", { enabled: true });

    expect(cacheSet).toHaveBeenCalledWith(
      "ff:async-execution",
      expect.stringContaining("true"),
      expect.any(Number),
    );
  });
});
