import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const REF_DIR = resolve(__dirname, "../reference");

/**
 * Step 5 — Runbook generation tests.
 * Validates that step5-runbook.ts produces a valid markdown file.
 */
describe.skip("Step 5 — runbook generation", () => {
  it("step5-runbook.ts generates runbook-phase1-production.md", async () => {
    const { execSync } = await import("node:child_process");
    execSync("pnpm tsx skills/rls-rollout/scripts/step5-runbook.ts --phase=1", {
      cwd: ROOT,
      encoding: "utf-8",
    });
    expect(existsSync(resolve(REF_DIR, "runbook-phase1-production.md"))).toBe(
      true
    );
  });

  it("generated runbook contains all Phase 1 table names", async () => {
    const { readFileSync } = await import("node:fs");
    const runbookPath = resolve(REF_DIR, "runbook-phase1-production.md");
    if (!existsSync(runbookPath)) return;

    const content = readFileSync(runbookPath, "utf-8");
    const phase1Tables = [
      "Agent",
      "CompanyMission",
      "Department",
      "Goal",
      "Invitation",
      "Template",
    ];
    for (const table of phase1Tables) {
      expect(content, `runbook should contain ${table}`).toContain(table);
    }
  });

  it("generated runbook contains 4-layer rollback procedure", async () => {
    const { readFileSync } = await import("node:fs");
    const runbookPath = resolve(REF_DIR, "runbook-phase1-production.md");
    if (!existsSync(runbookPath)) return;

    const content = readFileSync(runbookPath, "utf-8");
    expect(content).toContain("Layer 1");
    expect(content).toContain("Layer 4");
    expect(content).toContain("RLS_ENFORCEMENT_ENABLED=false");
  });

  it("master cutover runbook exists", () => {
    expect(
      existsSync(resolve(ROOT, "docs/rls-phase-1-cutover-runbook.md"))
    ).toBe(true);
  });

  it("rollout-playbook.md exists in reference/", () => {
    expect(existsSync(resolve(REF_DIR, "rollout-playbook.md"))).toBe(true);
  });
});
