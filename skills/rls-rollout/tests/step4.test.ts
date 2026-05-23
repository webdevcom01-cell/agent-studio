import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");

/**
 * Step 4 — Isolation test generation tests.
 * Validates that the isolation test generator creates valid stub files.
 * Actual cross-tenant DB tests live in tests/cross-tenant.test.ts.
 */
describe.skip("Step 4 — isolation test generation", () => {
  it("_helpers/get-rls-client.ts exists", () => {
    expect(
      existsSync(resolve(__dirname, "_helpers/get-rls-client.ts"))
    ).toBe(true);
  });

  it("step4-isolation-tests.ts generates output for --phase=1", async () => {
    const { execSync } = await import("node:child_process");
    execSync(
      "pnpm tsx skills/rls-rollout/scripts/step4-isolation-tests.ts --phase=1",
      { cwd: ROOT, encoding: "utf-8" }
    );
    expect(
      existsSync(resolve(__dirname, "generated/agent.isolation.test.ts"))
    ).toBe(true);
  });

  it("generated test files contain .skip", async () => {
    const { readFileSync } = await import("node:fs");
    const agentTest = resolve(__dirname, "generated/agent.isolation.test.ts");
    if (!existsSync(agentTest)) return;
    const content = readFileSync(agentTest, "utf-8");
    expect(content).toContain("describe.skip");
  });

  it("cross-tenant.test.ts exists (behavior-based test)", () => {
    expect(existsSync(resolve(__dirname, "cross-tenant.test.ts"))).toBe(true);
  });
});
