#!/usr/bin/env tsx
/**
 * classify-models.ts
 *
 * Parses prisma/schema.prisma and classifies every model by tenancy strategy.
 * Output: JSON to stdout.
 *
 * Tenancy classifications:
 *   TENANT_DIRECT     — has `organizationId String` column
 *   TENANT_INDIRECT   — has FK reaching a TENANT_DIRECT model
 *   USER_OWNED        — has `userId String` but no organizationId
 *   GLOBAL            — no tenant linkage (User, Organization, etc.)
 *   AMBIGUOUS         — needs schema change before RLS
 *
 * Usage:
 *   pnpm tsx skills/rls-rollout/scripts/classify-models.ts
 *
 * Reads:    prisma/schema.prisma
 * Writes:   stdout (JSON)
 */

import { readFileSync } from "node:fs";
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
  fkRelations: string[]; // FK column → target model
  classification: Tenancy;
  notes: string[];
};

// -----------------------------------------------------------------------------
// Parse schema.prisma
// -----------------------------------------------------------------------------

function parseSchema(content: string): ModelInfo[] {
  const lines = content.split("\n");
  const models: ModelInfo[] = [];
  let currentModel: ModelInfo | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Model start
    const modelMatch = trimmed.match(/^model\s+(\w+)\s*\{/);
    if (modelMatch) {
      currentModel = {
        name: modelMatch[1],
        line: i + 1,
        hasOrganizationId: false,
        hasUserId: false,
        hasIsPublic: false,
        organizationIdNullable: false,
        userIdNullable: false,
        fkRelations: [],
        classification: "AMBIGUOUS",
        notes: [],
      };
      continue;
    }

    // Model end
    if (currentModel && trimmed === "}") {
      models.push(currentModel);
      currentModel = null;
      continue;
    }

    if (!currentModel) continue;

    // Skip comments
    if (trimmed.startsWith("//")) continue;

    // Detect organizationId column
    const orgIdMatch = trimmed.match(/^organizationId\s+(\w+)(\?)?/);
    if (orgIdMatch) {
      currentModel.hasOrganizationId = true;
      currentModel.organizationIdNullable = !!orgIdMatch[2];
    }

    // Detect userId column
    const userIdMatch = trimmed.match(/^userId\s+(\w+)(\?)?/);
    if (userIdMatch) {
      currentModel.hasUserId = true;
      currentModel.userIdNullable = !!userIdMatch[2];
    }

    // Detect isPublic flag
    if (trimmed.match(/^isPublic\s+Boolean/)) {
      currentModel.hasIsPublic = true;
    }

    // Detect FK relations (e.g., `agent Agent @relation(...)`)
    const relMatch = trimmed.match(/^(\w+)\s+(\w+)(\[\])?\??\s+@relation/);
    if (relMatch) {
      const targetModel = relMatch[2];
      // Skip self-relations
      if (targetModel !== currentModel.name) {
        currentModel.fkRelations.push(targetModel);
      }
    }
  }

  return models;
}

// -----------------------------------------------------------------------------
// Classify
// -----------------------------------------------------------------------------

function classify(models: ModelInfo[]): ModelInfo[] {
  // GLOBAL models — fixed list per PLAN-V2
  const globalModels = new Set([
    "User",
    "VerificationToken",
    "Skill",
    "Organization",
    "PipelineTemplate",
  ]);

  // Build name → model map for FK resolution
  const byName = new Map<string, ModelInfo>();
  for (const m of models) byName.set(m.name, m);

  // First pass: GLOBAL + TENANT_DIRECT + USER_OWNED
  for (const m of models) {
    if (globalModels.has(m.name)) {
      m.classification = "GLOBAL";
      m.notes.push("Fixed GLOBAL classification");
      continue;
    }

    if (m.hasOrganizationId) {
      m.classification = "TENANT_DIRECT";
      if (m.organizationIdNullable) {
        m.notes.push("organizationId is nullable — handle NULL case");
      }
      if (m.hasIsPublic) {
        m.notes.push("Has isPublic flag — use policy-tenant-direct-with-public.sql.tpl");
      }
      continue;
    }

    if (m.hasUserId && !m.hasOrganizationId) {
      m.classification = "USER_OWNED";
      continue;
    }

    // AMBIGUOUS fallback (resolved in second pass)
    m.classification = "AMBIGUOUS";
  }

  // Second pass: TENANT_INDIRECT — reaches TENANT_DIRECT via FK
  // BFS up to depth 3
  const isTenantReachable = (modelName: string, depth: number = 0): boolean => {
    if (depth > 3) return false;
    const m = byName.get(modelName);
    if (!m) return false;
    if (m.classification === "TENANT_DIRECT") return true;
    for (const fk of m.fkRelations) {
      if (isTenantReachable(fk, depth + 1)) return true;
    }
    return false;
  };

  for (const m of models) {
    if (m.classification !== "AMBIGUOUS") continue;

    if (m.fkRelations.length === 0) {
      // No FKs — truly ambiguous (needs schema change or accept as GLOBAL)
      m.notes.push("No FK relations — needs human decision");
      continue;
    }

    for (const fk of m.fkRelations) {
      if (isTenantReachable(fk, 1)) {
        m.classification = "TENANT_INDIRECT";
        m.notes.push(`Reaches tenant via ${fk}`);
        break;
      }
    }
  }

  return models;
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

function main() {
  const schemaPath = resolve(process.cwd(), "prisma/schema.prisma");
  const content = readFileSync(schemaPath, "utf8");
  const models = classify(parseSchema(content));

  const counts: Record<Tenancy, number> = {
    TENANT_DIRECT: 0,
    TENANT_INDIRECT: 0,
    USER_OWNED: 0,
    GLOBAL: 0,
    AMBIGUOUS: 0,
  };
  for (const m of models) counts[m.classification]++;

  const output = {
    generated: new Date().toISOString(),
    schema_path: schemaPath,
    total_models: models.length,
    counts,
    models: models.sort((a, b) => a.name.localeCompare(b.name)),
  };

  console.log(JSON.stringify(output, null, 2));
}

main();
