import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
    expect(await isFeatureEnabled("onboarding-wizard")).toBe(false);
  });

  it("uses Redis override when present", async () => {
    vi.mocked(cacheGet).mockResolvedValueOnce(JSON.stringify({ enabled: true, rolloutPercent: 100 }));

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

describe("rls-enforcement flag", () => {
  const originalEnv = process.env.RLS_ENFORCEMENT_ENABLED;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.RLS_ENFORCEMENT_ENABLED;
    } else {
      process.env.RLS_ENFORCEMENT_ENABLED = originalEnv;
    }
  });

  it("is off by default", async () => {
    delete process.env.RLS_ENFORCEMENT_ENABLED;
    expect(await isFeatureEnabled("rls-enforcement")).toBe(false);
  });

  it("turns on when RLS_ENFORCEMENT_ENABLED=true", async () => {
    process.env.RLS_ENFORCEMENT_ENABLED = "true";
    expect(await isFeatureEnabled("rls-enforcement")).toBe(true);
  });

  it("stays off when RLS_ENFORCEMENT_ENABLED=false", async () => {
    process.env.RLS_ENFORCEMENT_ENABLED = "false";
    expect(await isFeatureEnabled("rls-enforcement")).toBe(false);
  });

  it("stays off when RLS_ENFORCEMENT_ENABLED is unset", async () => {
    delete process.env.RLS_ENFORCEMENT_ENABLED;
    expect(await isFeatureEnabled("rls-enforcement")).toBe(false);
  });

  it("Redis override still wins over env var", async () => {
    process.env.RLS_ENFORCEMENT_ENABLED = "true";
    // No orgId context → org check skipped → only one cacheGet call (Redis override).
    vi.mocked(cacheGet).mockResolvedValueOnce(
      JSON.stringify({ enabled: false, rolloutPercent: 0 }),
    );
    expect(await isFeatureEnabled("rls-enforcement")).toBe(false);
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
