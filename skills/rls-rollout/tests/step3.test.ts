import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const TEMPLATES_DIR = resolve(__dirname, "../templates");

/**
 * Step 3 — Migration generation tests.
 * Validates that SQL templates are well-formed and contain required placeholders.
 * No DB required — pure file checks.
 */
describe("Step 3 — migration templates", () => {
  const REQUIRED_TEMPLATES = [
    "tenant-direct.sql.template",
    "tenant-direct-public.sql.template",
    "tenant-indirect.sql.template",
    "user-owned.sql.template",
    "ambiguous-schema-additions.sql.template",
    "helper-functions.sql.template",
  ];

  for (const templateName of REQUIRED_TEMPLATES) {
    it(`${templateName} exists`, () => {
      expect(existsSync(resolve(TEMPLATES_DIR, templateName))).toBe(true);
    });
  }

  describe("tenant-direct.sql.template", () => {
    it("contains all required SQL statements", () => {
      const content = readFileSync(
        resolve(TEMPLATES_DIR, "tenant-direct.sql.template"),
        "utf-8"
      );
      expect(content).toContain("ENABLE ROW LEVEL SECURITY");
      expect(content).toContain("FORCE ROW LEVEL SECURITY");
      expect(content).toContain("GRANT SELECT, INSERT, UPDATE, DELETE");
      expect(content).toContain("CREATE POLICY {{table_lower}}_select");
      expect(content).toContain("CREATE POLICY {{table_lower}}_insert");
      expect(content).toContain("CREATE POLICY {{table_lower}}_update");
      expect(content).toContain("CREATE POLICY {{table_lower}}_delete");
      expect(content).toContain("app.current_org_id");
    });

    it("has rollback SQL", () => {
      const content = readFileSync(
        resolve(TEMPLATES_DIR, "tenant-direct.sql.template"),
        "utf-8"
      );
      expect(content).toContain("DROP POLICY IF EXISTS");
      expect(content).toContain("DISABLE ROW LEVEL SECURITY");
    });

    it("has {{TABLE_NAME}} placeholder", () => {
      const content = readFileSync(
        resolve(TEMPLATES_DIR, "tenant-direct.sql.template"),
        "utf-8"
      );
      expect(content).toContain("{{TABLE_NAME}}");
      expect(content).toContain("{{table_lower}}");
    });
  });

  describe("tenant-direct-public.sql.template", () => {
    it("includes isPublic = true clause in SELECT policy", () => {
      const content = readFileSync(
        resolve(TEMPLATES_DIR, "tenant-direct-public.sql.template"),
        "utf-8"
      );
      expect(content).toContain("isPublic");
      expect(content).toContain("OR");
    });
  });

  describe("tenant-indirect.sql.template", () => {
    it("contains EXISTS/IN subquery for parent table", () => {
      const content = readFileSync(
        resolve(TEMPLATES_DIR, "tenant-indirect.sql.template"),
        "utf-8"
      );
      expect(content).toContain("{{FK_COLUMN}}");
      expect(content).toContain("{{PARENT_TABLE}}");
      expect(content).toContain("{{PARENT_TENANT_COL}}");
      expect(content).toContain("IN (");
      expect(content).toContain("SELECT id FROM");
    });
  });

  describe("user-owned.sql.template", () => {
    it("uses app.current_user_id", () => {
      const content = readFileSync(
        resolve(TEMPLATES_DIR, "user-owned.sql.template"),
        "utf-8"
      );
      expect(content).toContain("app.current_user_id");
    });
  });

  describe("helper-functions.sql.template", () => {
    it("defines current_org_id() function", () => {
      const content = readFileSync(
        resolve(TEMPLATES_DIR, "helper-functions.sql.template"),
        "utf-8"
      );
      expect(content).toContain("CREATE OR REPLACE FUNCTION current_org_id()");
    });

    it("handles empty string via NULLIF", () => {
      const content = readFileSync(
        resolve(TEMPLATES_DIR, "helper-functions.sql.template"),
        "utf-8"
      );
      expect(content).toContain("NULLIF");
    });
  });

  describe.skip("step3-generate-migration.ts dry run", () => {
    it("generates valid SQL for Agent (TENANT_DIRECT_PUBLIC)", async () => {
      const { execSync } = await import("node:child_process");
      const result = execSync(
        "pnpm tsx skills/rls-rollout/scripts/step3-generate-migration.ts --table=Agent --classification=TENANT_DIRECT",
        { cwd: ROOT, encoding: "utf-8", stdio: "pipe" }
      );
      expect(result).toContain("Draft migration");
    });
  });
});
