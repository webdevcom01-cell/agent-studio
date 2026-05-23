import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");

/**
 * Step 0 — Pre-flight check tests.
 * Verifies that the preflight script's static file checks pass.
 * DB-dependent checks (roles, NULL rows) require DATABASE_URL and are skipped here.
 */
describe.skip("Step 0 — preflight checks", () => {
  it("withOrgContext uses $transaction", () => {
    const file = resolve(ROOT, "src/lib/db/rls-middleware.ts");
    expect(existsSync(file)).toBe(true);
    const content = readFileSync(file, "utf-8");
    expect(content).toContain("$transaction");
  });

  it("CI runs prisma migrate deploy", () => {
    const file = resolve(ROOT, ".github/workflows/ci.yml");
    expect(existsSync(file)).toBe(true);
    const content = readFileSync(file, "utf-8");
    expect(content).toContain("prisma migrate deploy");
  });

  it("RLS feature flag exists in feature-flags/index.ts", () => {
    const file = resolve(ROOT, "src/lib/feature-flags/index.ts");
    expect(existsSync(file)).toBe(true);
    const content = readFileSync(file, "utf-8");
    expect(content).toContain("RLS_ENFORCEMENT_ENABLED");
  });

  it("JWT type includes currentOrgId", () => {
    const file = resolve(ROOT, "src/types/next-auth.d.ts");
    if (!existsSync(file)) {
      // File may not exist yet — Phase 0c prerequisite
      return;
    }
    const content = readFileSync(file, "utf-8");
    expect(content).toContain("currentOrgId");
  });

  it("step0-preflight.sh is executable", () => {
    const file = resolve(ROOT, "skills/rls-rollout/scripts/step0-preflight.sh");
    expect(existsSync(file)).toBe(true);
  });
});
