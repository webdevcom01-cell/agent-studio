import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");

/**
 * Step 1 — Inventory tests.
 * Validates that the inventory script parses the schema correctly.
 * Reads prisma/schema.prisma directly (no DB required).
 */
describe.skip("Step 1 — model inventory", () => {
  it("schema.prisma exists", () => {
    expect(existsSync(resolve(ROOT, "prisma/schema.prisma"))).toBe(true);
  });

  it("step1-inventory.ts produces valid JSON on --dry-run", async () => {
    const { execSync } = await import("node:child_process");
    const output = execSync(
      "pnpm tsx skills/rls-rollout/scripts/step1-inventory.ts --dry-run",
      { cwd: ROOT, encoding: "utf-8" }
    );
    const parsed = JSON.parse(output) as { totalModels: number; counts: Record<string, number> };
    expect(parsed.totalModels).toBe(61);
  });

  it("TENANT_DIRECT count is 13", async () => {
    const { execSync } = await import("node:child_process");
    const output = execSync(
      "pnpm tsx skills/rls-rollout/scripts/step1-inventory.ts --dry-run",
      { cwd: ROOT, encoding: "utf-8" }
    );
    const parsed = JSON.parse(output) as { counts: Record<string, number> };
    expect(parsed.counts["TENANT_DIRECT"]).toBe(13);
  });

  it("GLOBAL includes Account and Session", async () => {
    const { execSync } = await import("node:child_process");
    const output = execSync(
      "pnpm tsx skills/rls-rollout/scripts/step1-inventory.ts --dry-run",
      { cwd: ROOT, encoding: "utf-8" }
    );
    const parsed = JSON.parse(output) as {
      models: Array<{ name: string; classification: string }>;
    };
    const globalModels = parsed.models
      .filter((m) => m.classification === "GLOBAL")
      .map((m) => m.name);
    expect(globalModels).toContain("Account");
    expect(globalModels).toContain("Session");
  });

  it("AMBIGUOUS includes AuditLog", async () => {
    const { execSync } = await import("node:child_process");
    const output = execSync(
      "pnpm tsx skills/rls-rollout/scripts/step1-inventory.ts --dry-run",
      { cwd: ROOT, encoding: "utf-8" }
    );
    const parsed = JSON.parse(output) as {
      models: Array<{ name: string; classification: string }>;
    };
    const ambiguous = parsed.models
      .filter((m) => m.classification === "AMBIGUOUS")
      .map((m) => m.name);
    expect(ambiguous).toContain("AuditLog");
  });
});
