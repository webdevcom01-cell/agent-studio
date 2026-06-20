#!/usr/bin/env tsx
/**
 * generate-migration.ts
 *
 * STEP 2 (plan generation) + STEP 3 (migration draft).
 *
 * Reads reference/model-classifications.json (produced by classify-models.ts),
 * filters models by phase/classification, and produces either:
 *   --plan     A human-readable markdown plan (STEP 2)
 *   --draft    A Prisma-compatible migration.sql file (STEP 3)
 *
 * Usage:
 *   pnpm tsx skills/rls-rollout/scripts/generate-migration.ts \
 *     --phase=1 \
 *     --classification=TENANT_DIRECT \
 *     --plan
 *
 *   pnpm tsx skills/rls-rollout/scripts/generate-migration.ts \
 *     --phase=1 \
 *     --classification=TENANT_DIRECT \
 *     --draft
 *
 * Outputs:
 *   --plan  → skills/rls-rollout/reference/migration-plan-phase{N}.md
 *   --draft → prisma/migrations/draft/{timestamp}_rls_phase{N}_{classification}/migration.sql
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

type Tenancy =
  | "TENANT_DIRECT"
  | "TENANT_INDIRECT"
  | "USER_OWNED"
  | "GLOBAL"
  | "AMBIGUOUS";

type ModelInfo = {
  name: string;
  line: number;
  hasOrganizationId: boolean;
  hasUserId: boolean;
  hasIsPublic: boolean;
  organizationIdNullable: boolean;
  userIdNullable: boolean;
  fkRelations: string[];
  classification: Tenancy;
  notes: string[];
};

type Classifications = {
  generated: string;
  schema_path: string;
  total_models: number;
  counts: Record<Tenancy, number>;
  models: ModelInfo[];
};

// -----------------------------------------------------------------------------
// Argument parsing
// -----------------------------------------------------------------------------

function parseArgs(argv: string[]): {
  phase: number;
  classification: Tenancy;
  mode: "plan" | "draft";
} {
  const args: Record<string, string> = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) args[m[1]] = m[2] ?? "true";
  }

  const phase = parseInt(args.phase ?? "1", 10);
  const classification = (args.classification ?? "TENANT_DIRECT") as Tenancy;
  const mode = args.draft === "true" ? "draft" : "plan";

  if (![1, 2, 3, 4].includes(phase)) {
    throw new Error(`Invalid phase: ${phase}. Use 1, 2, 3, or 4.`);
  }

  return { phase, classification, mode };
}

// -----------------------------------------------------------------------------
// Template loader
// -----------------------------------------------------------------------------

function loadTemplate(name: string): string {
  const path = resolve(__dirname, "..", "templates", name);
  if (!existsSync(path)) throw new Error(`Template not found: ${path}`);
  return readFileSync(path, "utf8");
}

function substitute(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

// -----------------------------------------------------------------------------
// Per-model SQL generators
// -----------------------------------------------------------------------------

function generateForModel(model: ModelInfo): { sql: string; note: string } {
  const vars = {
    TABLE_NAME: model.name,
    table_lower: model.name.toLowerCase(),
  };

  switch (model.classification) {
    case "TENANT_DIRECT": {
      const tmpl = model.hasIsPublic
        ? loadTemplate("policy-tenant-direct-with-public.sql.tpl")
        : loadTemplate("policy-tenant-direct.sql.tpl");
      return {
        sql: substitute(tmpl, vars),
        note: model.hasIsPublic ? "with isPublic clause" : "standard",
      };
    }

    case "TENANT_INDIRECT": {
      // Best-effort: first FK that reaches a tenant
      // For full accuracy, we'd parse the FK column name from schema.
      // Here we use a heuristic — most TENANT_INDIRECT in this schema use agentId.
      const fkColumn = guessFkColumn(model);
      const parentTable = model.fkRelations[0] ?? "Agent";
      const parentTenantCol = "organizationId";

      const tmpl = loadTemplate("policy-tenant-indirect.sql.tpl");
      return {
        sql: substitute(tmpl, {
          ...vars,
          FK_COLUMN: fkColumn,
          PARENT_TABLE: parentTable,
          PARENT_TENANT_COL: parentTenantCol,
        }),
        note: `via ${fkColumn} → ${parentTable}.${parentTenantCol}`,
      };
    }

    case "USER_OWNED": {
      const tmpl = loadTemplate("policy-user-owned.sql.tpl");
      return { sql: substitute(tmpl, vars), note: "user-scoped" };
    }

    case "GLOBAL": {
      return {
        sql: `-- ${model.name}: GLOBAL classification — no RLS applied\n`,
        note: "skipped (GLOBAL)",
      };
    }

    case "AMBIGUOUS": {
      return {
        sql: `-- ${model.name}: AMBIGUOUS — needs schema change before RLS\n-- Notes: ${model.notes.join("; ")}\n`,
        note: "deferred (AMBIGUOUS)",
      };
    }
  }
}

function guessFkColumn(model: ModelInfo): string {
  // Most TENANT_INDIRECT in this schema use lowercase parent name + "Id"
  // E.g., Flow has agentId, KBSource has knowledgeBaseId
  // For accuracy, the next iteration should parse schema for actual FK column.
  const firstFk = model.fkRelations[0];
  if (!firstFk) return "agentId";

  // Lowercase first letter
  return firstFk.charAt(0).toLowerCase() + firstFk.slice(1) + "Id";
}

// -----------------------------------------------------------------------------
// Plan generation (markdown)
// -----------------------------------------------------------------------------

function generatePlan(
  models: ModelInfo[],
  phase: number,
  classification: Tenancy
): string {
  const filtered = models.filter((m) => m.classification === classification);
  const lines: string[] = [];

  lines.push(`# Migration plan — Phase ${phase} (${classification})`);
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`Models in scope: **${filtered.length}**`);
  lines.push("");
  lines.push("## Tables");
  lines.push("");
  lines.push("| # | Model | Notes |");
  lines.push("|---|-------|-------|");
  filtered.forEach((m, i) => {
    lines.push(`| ${i + 1} | \`${m.name}\` | ${m.notes.join("; ") || "—"} |`);
  });
  lines.push("");

  lines.push("## SQL preview");
  lines.push("");
  lines.push("```sql");
  for (const m of filtered.slice(0, 3)) {
    const { sql } = generateForModel(m);
    lines.push(`-- ============================================================`);
    lines.push(`-- ${m.name}`);
    lines.push(`-- ============================================================`);
    lines.push(sql.split("\n").slice(0, 30).join("\n"));
    lines.push("-- ... (truncated, full SQL in --draft output)");
    lines.push("");
  }
  if (filtered.length > 3) {
    lines.push(`-- (${filtered.length - 3} more models — see --draft for full SQL)`);
  }
  lines.push("```");
  lines.push("");

  lines.push("## Next steps");
  lines.push("");
  lines.push(
    "1. Review this plan. If approved, generate the migration draft:"
  );
  lines.push("   ```bash");
  lines.push(
    `   pnpm tsx skills/rls-rollout/scripts/generate-migration.ts \\`
  );
  lines.push(
    `     --phase=${phase} --classification=${classification} --draft`
  );
  lines.push("   ```");
  lines.push("2. Review the generated migration.sql.");
  lines.push("3. Move out of `draft/` and apply to staging:");
  lines.push("   ```bash");
  lines.push(
    "   mv prisma/migrations/draft/YYYYMMDDHHMMSS_rls_phase{N}_{class}/ prisma/migrations/"
  );
  lines.push("   DATABASE_URL=$STAGING_URL pnpm prisma migrate deploy");
  lines.push("   ```");
  lines.push("4. Run STEP 4 verification:");
  lines.push("   ```bash");
  lines.push(`   bash skills/rls-rollout/scripts/verify-staging.sh --phase=${phase}`);
  lines.push("   ```");

  return lines.join("\n");
}

// -----------------------------------------------------------------------------
// Draft generation (SQL migration file)
// -----------------------------------------------------------------------------

function generateDraft(
  models: ModelInfo[],
  phase: number,
  classification: Tenancy
): { content: string; outDir: string; outFile: string } {
  const filtered = models.filter((m) => m.classification === classification);

  const timestamp = new Date()
    .toISOString()
    .replace(/[-T:]/g, "")
    .replace(/\..*$/, "");
  const dirName = `${timestamp}_rls_phase${phase}_${classification.toLowerCase()}`;
  const outDir = resolve(
    process.cwd(),
    "prisma/migrations/draft",
    dirName
  );
  const outFile = resolve(outDir, "migration.sql");

  const lines: string[] = [];
  lines.push(`-- =============================================================================`);
  lines.push(`-- Phase ${phase}: ${classification}`);
  lines.push(`-- Generated by skills/rls-rollout v1.0.0`);
  lines.push(`-- Generated at: ${new Date().toISOString()}`);
  lines.push(`-- Models: ${filtered.length}`);
  lines.push(`-- =============================================================================`);
  lines.push("");
  lines.push("-- IMPORTANT: This migration assumes:");
  lines.push("--   1. app_user and admin_user roles exist (run create-roles migration first)");
  lines.push("--   2. withOrgContext helper uses $transaction (Phase 0a complete)");
  lines.push("--   3. RLS_ENFORCEMENT_ENABLED flag is OFF initially (gradual cutover)");
  lines.push("");

  for (const m of filtered) {
    const { sql, note } = generateForModel(m);
    lines.push(`-- =============================================================================`);
    lines.push(`-- Model: ${m.name} (${note})`);
    lines.push(`-- =============================================================================`);
    lines.push(sql);
    lines.push("");
  }

  return { content: lines.join("\n"), outDir, outFile };
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

function main() {
  const { phase, classification, mode } = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const classificationsPath = resolve(
    cwd,
    "skills/rls-rollout/reference/model-classifications.json"
  );

  if (!existsSync(classificationsPath)) {
    console.error(
      `ERROR: ${classificationsPath} not found. Run audit.sh --inventory first.`
    );
    process.exit(1);
  }

  const data: Classifications = JSON.parse(
    readFileSync(classificationsPath, "utf8")
  );

  console.error(`Loaded ${data.models.length} models`);
  console.error(
    `Phase ${phase} (${classification}): ${data.counts[classification]} models`
  );

  if (mode === "plan") {
    const plan = generatePlan(data.models, phase, classification);
    const outFile = resolve(
      cwd,
      `skills/rls-rollout/reference/migration-plan-phase${phase}.md`
    );
    writeFileSync(outFile, plan);
    console.error(`✓ Plan written to ${outFile}`);
    console.error(`  Review, then re-run with --draft to generate SQL`);
  } else {
    const { content, outDir, outFile } = generateDraft(
      data.models,
      phase,
      classification
    );
    mkdirSync(outDir, { recursive: true });
    writeFileSync(outFile, content);
    console.error(`✓ Migration draft written to ${outFile}`);
    console.error(`  Review the SQL, then:`);
    console.error(`    mv ${outDir} prisma/migrations/`);
    console.error(`    DATABASE_URL=$STAGING_URL pnpm prisma migrate deploy`);
  }
}

main();
