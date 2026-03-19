import { describe, it, expect, vi, afterEach } from "vitest";

describe("feature-flag", () => {
  const originalEnv = process.env.ECC_ENABLED;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.ECC_ENABLED;
    } else {
      process.env.ECC_ENABLED = originalEnv;
    }
    vi.resetModules();
  });

  it("isECCEnabled returns false by default (opt-in)", async () => {
    delete process.env.ECC_ENABLED;
    const { isECCEnabled } = await import("../feature-flag");
    expect(isECCEnabled()).toBe(false);
  });

  it("isECCEnabled returns true when set to 'true'", async () => {
    process.env.ECC_ENABLED = "true";
    const { isECCEnabled } = await import("../feature-flag");
    expect(isECCEnabled()).toBe(true);
  });

  it("isECCEnabled returns false when set to 'false'", async () => {
    process.env.ECC_ENABLED = "false";
    const { isECCEnabled } = await import("../feature-flag");
    expect(isECCEnabled()).toBe(false);
  });

  it("isECCEnabledForAgent checks both global and per-agent flags", async () => {
    process.env.ECC_ENABLED = "true";
    const { isECCEnabledForAgent } = await import("../feature-flag");

    expect(isECCEnabledForAgent(true)).toBe(true);
    expect(isECCEnabledForAgent(false)).toBe(false);
  });

  it("isECCEnabledForAgent returns false when global is disabled", async () => {
    delete process.env.ECC_ENABLED;
    const { isECCEnabledForAgent } = await import("../feature-flag");

    expect(isECCEnabledForAgent(true)).toBe(false);
  });
});
