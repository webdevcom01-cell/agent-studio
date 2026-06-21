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
 *   --draft → skills/rls-rollout/reference/drafts/{timestamp}_rls_phase{N}_{classification}/migration.sql
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
  tenantPath: string;
  classification: Tenancy;
  notes: string[];
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
        ? loadTemplate("tenant-direct-public.sql.template")
        : loadTemplate("tenant-direct.sql.template");
      return {
        sql: substitute(tmpl, vars),
        note: model.hasIsPublic ? "with isPublic clause" : "standard",
      };
    }

    case "TENANT_INDIRECT": {
      // The authoritative FK chain is step1-inventory.ts's tenantPath, e.g.
      // "agentId → Agent.organizationId". The single-hop template can only
      // express a one-level chain; multi-hop chains (e.g. KBChunk:
      // "sourceId → KBSource → … → Agent.organizationId") must be hand-authored.
      const hop = parseSingleHop(model.tenantPath);
      if (!hop) {
        return {
          sql:
            `-- ${model.name}: TENANT_INDIRECT multi-hop chain — policy must be ` +
            `hand-authored with a nested EXISTS subquery.\n` +
            `-- Tenant path: ${model.tenantPath || "unknown"}\n`,
          note: `MANUAL (multi-hop): ${model.tenantPath || "unknown"}`,
        };
      }

      const tmpl = loadTemplate("tenant-indirect.sql.template");
      return {
        sql: substitute(tmpl, {
          ...vars,
          FK_COLUMN: hop.fkColumn,
          PARENT_TABLE: hop.parentTable,
          PARENT_TENANT_COL: hop.parentTenantCol,
        }),
        note: `via ${hop.fkColumn} → ${hop.parentTable}.${hop.parentTenantCol}`,
      };
    }

    case "USER_OWNED": {
      const tmpl = loadTemplate("user-owned.sql.template");
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

// Parse a single-hop tenant path "<fkColumn> → <ParentTable>.organizationId".
// Returns null for multi-hop chains (2+ arrows) or paths that don't terminate
// directly at a parent's organizationId — those need hand-authored policies.
function parseSingleHop(
  tenantPath: string
): { fkColumn: string; parentTable: string; parentTenantCol: string } | null {
  const hops = tenantPath.split("→").map((s) => s.trim());
  if (hops.length !== 2) return null;
  const target = hops[1].match(/^(\w+)\.(\w+)$/);
  if (!target || target[2] !== "organizationId") return null;
  return { fkColumn: hops[0], parentTable: target[1], parentTenantCol: target[2] };
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
    "   mv skills/rls-rollout/reference/drafts/YYYYMMDDHHMMSS_rls_phase{N}_{class}/ prisma/migrations/"
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

function loadEnabledTables(): Set<string> {
  const tsvPath = resolve(
    process.cwd(),
    "skills/rls-rollout/reference/existing-rls-state.tsv"
  );
  if (!existsSync(tsvPath)) return new Set();
  const enabled = new Set<string>();
  for (const line of readFileSync(tsvPath, "utf8").trim().split("\n")) {
    const [name, rlsEnabled] = line.split("\t");
    if (rlsEnabled === "t") enabled.add(name);
  }
  return enabled;
}

function generateDraft(
  models: ModelInfo[],
  phase: number,
  classification: Tenancy
): { content: string; outDir: string; outFile: string } {
  // Skip tables that already have RLS enabled (from STEP 1 inventory) so the
  // draft only touches pending tables — re-enabling done tables is needless
  // churn and risks clobbering already-deployed policies.
  const enabledTables = loadEnabledTables();
  const inScope = models.filter((m) => m.classification === classification);
  const filtered = inScope.filter((m) => !enabledTables.has(m.name));
  const skipped = inScope.filter((m) => enabledTables.has(m.name));

  const timestamp = new Date()
    .toISOString()
    .replace(/[-T:]/g, "")
    .replace(/\..*$/, "");
  const dirName = `${timestamp}_rls_phase${phase}_${classification.toLowerCase()}`;
  // Staging dir lives OUTSIDE prisma/migrations/ — Prisma scans every subdir of
  // migrations/, so a draft there is picked up as an (invalid) pending migration
  // and would break `prisma migrate deploy`. The operator moves it into
  // prisma/migrations/ only when ready to apply.
  const outDir = resolve(
    process.cwd(),
    "skills/rls-rollout/reference/drafts",
    dirName
  );
  const outFile = resolve(outDir, "migration.sql");

  const lines: string[] = [];
  lines.push(`-- =============================================================================`);
  lines.push(`-- Phase ${phase}: ${classification}`);
  lines.push(`-- Generated by skills/rls-rollout v1.0.0`);
  lines.push(`-- Generated at: ${new Date().toISOString()}`);
  lines.push(`-- Models (pending): ${filtered.length}`);
  if (skipped.length) {
    lines.push(
      `-- Skipped (already RLS-enabled): ${skipped.map((m) => m.name).join(", ")}`
    );
  }
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

// step1-inventory.ts (v1.1.0) emits notes as a string and FK columns under
// `fkColumns`, while this consumer expects notes: string[] and `fkRelations`.
// Normalize the loaded JSON into the ModelInfo shape so both legacy and v1.1.0
// inventories work.
function normalizeModels(raw: Array<Record<string, unknown>>): ModelInfo[] {
  return raw.map((m) => ({
    name: String(m.name ?? ""),
    line: typeof m.line === "number" ? m.line : 0,
    hasOrganizationId: Boolean(m.hasOrganizationId),
    hasUserId: Boolean(m.hasUserId),
    hasIsPublic: Boolean(m.hasIsPublic),
    organizationIdNullable: Boolean(m.organizationIdNullable),
    userIdNullable: Boolean(m.userIdNullable),
    fkRelations: Array.isArray(m.fkRelations)
      ? (m.fkRelations as string[])
      : Array.isArray(m.fkColumns)
        ? (m.fkColumns as string[])
        : [],
    tenantPath: typeof m.tenantPath === "string" ? m.tenantPath : "",
    classification: m.classification as Tenancy,
    notes: Array.isArray(m.notes)
      ? (m.notes as string[])
      : m.notes
        ? [String(m.notes)]
        : [],
  }));
}

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

  const parsed = JSON.parse(readFileSync(classificationsPath, "utf8")) as {
    models: Array<Record<string, unknown>>;
    counts: Record<Tenancy, number>;
  };
  const models = normalizeModels(parsed.models);
  const counts =
    parsed.counts ??
    ({} as Record<Tenancy, number>);

  console.error(`Loaded ${models.length} models`);
  console.error(
    `Phase ${phase} (${classification}): ${counts[classification] ?? models.filter((m) => m.classification === classification).length} models`
  );

  if (mode === "plan") {
    const plan = generatePlan(models, phase, classification);
    const outFile = resolve(
      cwd,
      `skills/rls-rollout/reference/migration-plan-phase${phase}.md`
    );
    writeFileSync(outFile, plan);
    console.error(`✓ Plan written to ${outFile}`);
    console.error(`  Review, then re-run with --draft to generate SQL`);
  } else {
    const { content, outDir, outFile } = generateDraft(
      models,
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
