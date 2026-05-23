#!/usr/bin/env tsx
/**
 * step3-generate-migration.ts — Generate RLS migration SQL for one table.
 *
 * Reads the appropriate template from skills/rls-rollout/templates/,
 * fills in placeholders, and writes a draft migration file.
 * NEVER applies migrations — output is for human review.
 *
 * Usage:
 *   pnpm tsx skills/rls-rollout/scripts/step3-generate-migration.ts \
 *     --table=Agent \
 *     --classification=TENANT_DIRECT
 *
 *   pnpm tsx skills/rls-rollout/scripts/step3-generate-migration.ts \
 *     --table=Flow \
 *     --classification=TENANT_INDIRECT \
 *     --fk=agentId \
 *     --parent=Agent \
 *     --parent-tenant-col=organizationId
 *
 *   # Generate for all tables in a phase:
 *   pnpm tsx skills/rls-rollout/scripts/step3-generate-migration.ts --phase=1
 *
 * Output:
 *   prisma/migrations/draft/YYYYMMDD_rls_phase{N}_{TABLE}/migration.sql
 *
 * Placeholders:
 *   {{TABLE_NAME}}       — PascalCase model name (e.g., "Agent")
 *   {{table_lower}}      — lowercase (e.g., "agent")
 *   {{FK_COLUMN}}        — FK column for TENANT_INDIRECT (e.g., "agentId")
 *   {{PARENT_TABLE}}     — Parent table for TENANT_INDIRECT (e.g., "Agent")
 *   {{PARENT_TENANT_COL}} — Parent tenant column (e.g., "organizationId")
 *   {{POLICIES_BLOCK}}   — Auto-generated policy SQL
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");
const TEMPLATES_DIR = resolve(__dirname, "../templates");
const DRAFT_DIR = resolve(ROOT, "prisma/migrations/draft");

type Classification = "TENANT_DIRECT" | "TENANT_DIRECT_PUBLIC" | "TENANT_INDIRECT" | "USER_OWNED";

const PHASE_1_TABLES: Array<{ name: string; classification: Classification }> = [
  { name: "Agent", classification: "TENANT_DIRECT_PUBLIC" },
  { name: "AgentPermissionGrant", classification: "TENANT_DIRECT" },
  { name: "ApprovalPolicy", classification: "TENANT_DIRECT" },
  { name: "CompanyMission", classification: "TENANT_DIRECT" },
  { name: "Department", classification: "TENANT_DIRECT" },
  { name: "Goal", classification: "TENANT_DIRECT" },
  { name: "HeartbeatConfig", classification: "TENANT_DIRECT" },
  { name: "HeartbeatContext", classification: "TENANT_DIRECT" },
  { name: "HeartbeatRun", classification: "TENANT_DIRECT" },
  { name: "Invitation", classification: "TENANT_DIRECT" },
  { name: "OrganizationMember", classification: "TENANT_DIRECT" },
  { name: "PolicyDecision", classification: "TENANT_DIRECT" },
  { name: "Template", classification: "TENANT_DIRECT_PUBLIC" },
];

function getTemplateName(classification: Classification): string {
  switch (classification) {
    case "TENANT_DIRECT_PUBLIC":
      return "tenant-direct-public.sql.template";
    case "TENANT_DIRECT":
      return "tenant-direct.sql.template";
    case "TENANT_INDIRECT":
      return "tenant-indirect.sql.template";
    case "USER_OWNED":
      return "user-owned.sql.template";
  }
}

function fillTemplate(
  template: string,
  vars: Record<string, string>
): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}

function generateForTable(
  tableName: string,
  classification: Classification,
  opts: { fkColumn?: string; parentTable?: string; parentTenantCol?: string } = {}
): string {
  const templateFile = resolve(TEMPLATES_DIR, getTemplateName(classification));

  if (!existsSync(templateFile)) {
    throw new Error(`Template not found: ${templateFile}`);
  }

  const template = readFileSync(templateFile, "utf-8");
  const vars: Record<string, string> = {
    TABLE_NAME: tableName,
    table_lower: tableName.toLowerCase(),
    FK_COLUMN: opts.fkColumn ?? "agentId",
    PARENT_TABLE: opts.parentTable ?? "Agent",
    PARENT_TENANT_COL: opts.parentTenantCol ?? "organizationId",
  };

  return fillTemplate(template, vars);
}

function writeDraftMigration(
  tableName: string,
  phaseNum: number,
  sql: string
): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const dirName = `${date}_rls_phase${phaseNum}_${tableName.toLowerCase()}`;
  const outDir = resolve(DRAFT_DIR, dirName);
  const outFile = resolve(outDir, "migration.sql");

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outFile, sql);

  return outFile;
}

function parseArgs(): {
  table?: string;
  classification?: Classification;
  phase?: number;
  fkColumn?: string;
  parentTable?: string;
  parentTenantCol?: string;
} {
  const args: Record<string, string> = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([^=]+)=?(.*)$/);
    if (m) args[m[1]] = m[2] || "true";
  }

  return {
    table: args["table"],
    classification: args["classification"] as Classification | undefined,
    phase: args["phase"] ? parseInt(args["phase"], 10) : undefined,
    fkColumn: args["fk"],
    parentTable: args["parent"],
    parentTenantCol: args["parent-tenant-col"],
  };
}

function run(): void {
  const opts = parseArgs();

  if (opts.phase === 1) {
    console.log("Generating Phase 1 (TENANT_DIRECT) migration drafts...\n");
    for (const { name, classification } of PHASE_1_TABLES) {
      try {
        const sql = generateForTable(name, classification);
        const outFile = writeDraftMigration(name, 1, sql);
        console.log(`✓ ${name.padEnd(25)} → ${outFile.replace(ROOT + "/", "")}`);
      } catch (err) {
        console.error(`✗ ${name}: ${err instanceof Error ? err.message : err}`);
      }
    }
    console.log("\nReview drafts in prisma/migrations/draft/ before applying.");
    return;
  }

  if (!opts.table || !opts.classification) {
    console.error("Usage:");
    console.error("  --table=<ModelName> --classification=<TENANT_DIRECT|TENANT_INDIRECT|USER_OWNED>");
    console.error("  --phase=1  (generate all Phase 1 tables)");
    process.exit(1);
  }

  const sql = generateForTable(opts.table, opts.classification, {
    fkColumn: opts.fkColumn,
    parentTable: opts.parentTable,
    parentTenantCol: opts.parentTenantCol,
  });

  const outFile = writeDraftMigration(opts.table, 1, sql);
  console.log(`✓ Draft migration: ${outFile.replace(ROOT + "/", "")}`);
  console.log("\nNext steps:");
  console.log("  1. Review the SQL file");
  console.log("  2. Move out of draft/ when approved");
  console.log("  3. Apply to STAGING: DATABASE_URL=$STAGING_URL pnpm prisma migrate deploy");
  console.log("  4. Run STEP 4 staging verification");
}

run();
