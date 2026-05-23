import { describe, it, expect } from "vitest";
import { runWithOrgId, getCurrentOrgId } from "../org-context";

describe("org-context ALS", () => {
  it("returns null outside any run", () => {
    expect(getCurrentOrgId()).toBeNull();
  });

  it("returns the orgId set by runWithOrgId", async () => {
    let captured: string | null = null;
    await runWithOrgId("org-123", async () => {
      captured = getCurrentOrgId();
    });
    expect(captured).toBe("org-123");
  });

  it("returns null when run with null", async () => {
    let captured: string | null = "not-null";
    await runWithOrgId(null, async () => {
      captured = getCurrentOrgId();
    });
    expect(captured).toBeNull();
  });

  it("restores null after run completes", async () => {
    await runWithOrgId("org-abc", async () => {
      expect(getCurrentOrgId()).toBe("org-abc");
    });
    expect(getCurrentOrgId()).toBeNull();
  });

  it("isolates nested contexts correctly", async () => {
    const outer: Array<string | null> = [];
    const inner: Array<string | null> = [];

    await runWithOrgId("outer-org", async () => {
      outer.push(getCurrentOrgId());
      await runWithOrgId("inner-org", async () => {
        inner.push(getCurrentOrgId());
      });
      outer.push(getCurrentOrgId());
    });

    expect(outer).toEqual(["outer-org", "outer-org"]);
    expect(inner).toEqual(["inner-org"]);
  });

  it("propagates orgId across async boundaries", async () => {
    const results: Array<string | null> = [];

    await runWithOrgId("async-org", async () => {
      await Promise.resolve();
      results.push(getCurrentOrgId());
      await new Promise<void>((resolve) => setImmediate(resolve));
      results.push(getCurrentOrgId());
    });

    expect(results).toEqual(["async-org", "async-org"]);
  });
});
