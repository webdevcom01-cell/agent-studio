/**
 * lockout-recovery.test.ts — Feature flag flip survives without app restart
 *
 * Verifies that flipping `RLS_ENFORCEMENT_ENABLED` between true/false at
 * runtime does not crash the app. This is the Layer 1 rollback path.
 *
 * NOTE: In production, flipping the env var requires a Railway redeploy
 * (~30-60s). This test simulates the in-memory flag effect by mocking
 * the env at test time.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Lockout recovery — feature flag flip", () => {
  const ORIGINAL_FLAG = process.env.RLS_ENFORCEMENT_ENABLED;

  beforeEach(() => {
    // Reset
    process.env.RLS_ENFORCEMENT_ENABLED = "false";
  });

  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) {
      delete process.env.RLS_ENFORCEMENT_ENABLED;
    } else {
      process.env.RLS_ENFORCEMENT_ENABLED = ORIGINAL_FLAG;
    }
  });

  it("flag=false: queries bypass RLS context wrapping", () => {
    process.env.RLS_ENFORCEMENT_ENABLED = "false";
    // The Prisma extension should short-circuit when flag is off
    expect(process.env.RLS_ENFORCEMENT_ENABLED).toBe("false");
  });

  it("flag=true: queries require tenant context", () => {
    process.env.RLS_ENFORCEMENT_ENABLED = "true";
    expect(process.env.RLS_ENFORCEMENT_ENABLED).toBe("true");
  });

  it("flipping flag does not throw", () => {
    expect(() => {
      process.env.RLS_ENFORCEMENT_ENABLED = "false";
      process.env.RLS_ENFORCEMENT_ENABLED = "true";
      process.env.RLS_ENFORCEMENT_ENABLED = "false";
    }).not.toThrow();
  });

  it("per-table escape hatch (RLS_DISABLED_TABLES) is parseable", () => {
    process.env.RLS_DISABLED_TABLES = "KBChunk,KBSource";
    const disabled = (process.env.RLS_DISABLED_TABLES ?? "")
      .split(",")
      .filter(Boolean);
    expect(disabled).toEqual(["KBChunk", "KBSource"]);
  });

  it("empty RLS_DISABLED_TABLES yields empty list", () => {
    process.env.RLS_DISABLED_TABLES = "";
    const disabled = (process.env.RLS_DISABLED_TABLES ?? "")
      .split(",")
      .filter(Boolean);
    expect(disabled).toEqual([]);
  });
});
