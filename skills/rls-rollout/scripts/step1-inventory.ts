#!/usr/bin/env tsx
/**
 * step1-inventory.ts — Generate JSON inventory of all 61 Prisma models.
 *
 * Reads prisma/schema.prisma, classifies every model by tenancy strategy,
 * and writes the result to reference/model-classifications.json (machine)
 * and reference/model-classifications.md (human-readable).
 *
 * Classification rules:
 *   GLOBAL         — No tenant linkage (User, VerificationToken, Skill, Organization, PipelineTemplate)
 *                    + NextAuth tables (Account, Session) treated as GLOBAL
 *                    + BYPASSRLS capability-isolated tables (ApiKey, MCPServer, GoogleOAuthToken):
 *                      read by opaque id/keyHash in pre-auth or worker contexts where no
 *                      app.current_user_id exists, so a USER_OWNED policy would break auth/runtime
 *   TENANT_DIRECT  — Has organizationId column directly
 *   TENANT_INDIRECT — Reaches organizationId via FK chain (agentId → Agent → organizationId)
 *   USER_OWNED     — Has userId but no organizationId, RLS-enforced via app.current_user_id (CLIGeneration)
 *   AMBIGUOUS      — Needs schema change before RLS can be applied (AuditLog)
 *
 * Usage:
 *   pnpm tsx skills/rls-rollout/scripts/step1-inventory.ts
 *   pnpm tsx skills/rls-rollout/scripts/step1-inventory.ts --dry-run
 *
 * Outputs:
 *   reference/model-classifications.json
 *   (updates reference/model-classifications.md if --write-md flag passed)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");
const SCHEMA_PATH = resolve(ROOT, "prisma/schema.prisma");
const OUT_JSON = resolve(__dirname, "../reference/model-classifications.json");

type Classification =
  | "TENANT_DIRECT"
  | "TENANT_INDIRECT"
  | "USER_OWNED"
  | "GLOBAL"
  | "AMBIGUOUS";

interface ModelRecord {
  name: string;
  line: number;
  classification: Classification;
  fkColumns: string[];
  hasOrganizationId: boolean;
  hasUserId: boolean;
  hasIsPublic: boolean;
  tenantPath: string;
  notes: string;
}

const GLOBAL_MODELS = new Set([
  "User",
  "VerificationToken",
  "Skill",
  "Organization",
  "PipelineTemplate",
  "Account",
  "Session",
  // BYPASSRLS — capability-isolated, not under RLS (see BYPASSRLS_NOTES)
  "ApiKey",
  "MCPServer",
  "GoogleOAuthToken",
]);

const USER_OWNED_MODELS = new Set([
  "CLIGeneration",
]);

// Capability-isolated GLOBAL models — not under RLS (admin/BYPASSRLS DB role).
// Read by opaque id/keyHash in pre-auth or worker contexts where no
// app.current_user_id session variable exists, so a USER_OWNED RLS policy
// would hide the row and break authentication / flow runtime.
const BYPASSRLS_NOTES: Record<string, string> = {
  ApiKey: "BYPASSRLS — capability-based isolation via keyHash (read pre-auth, not under RLS)",
  MCPServer: "BYPASSRLS — capability-based isolation, worker hot-path (5 runtime reads by id, no userId)",
  GoogleOAuthToken: "BYPASSRLS — intentionally unauthenticated proxy/refresh (tokenId is the capability)",
};

const AMBIGUOUS_MODELS = new Set(["AuditLog", "ModelPerformanceStat"]);

function parseSchemaModels(
  content: string
): Array<{ name: string; body: string; line: number }> {
  const models: Array<{ name: string; body: string; line: number }> = [];
  const lines = content.split("\n");
  let current: string | null = null;
  let startLine = 0;
  let depth = 0;
  const bodyLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const modelMatch = line.match(/^model (\w+) \{/);

    if (modelMatch && depth === 0) {
      current = modelMatch[1];
      startLine = i + 1;
      depth = 1;
      bodyLines.length = 0;
    } else if (current) {
      depth += (line.match(/\{/g) || []).length;
      depth -= (line.match(/\}/g) || []).length;

      if (depth <= 0) {
        models.push({ name: current, body: bodyLines.join("\n"), line: startLine });
        current = null;
        depth = 0;
        bodyLines.length = 0;
      } else {
        bodyLines.push(line);
      }
    }
  }

  return models;
}

function extractFKs(body: string): string[] {
  const fks: string[] = [];
  for (const match of body.matchAll(/(\w+Id)\s+String/g)) {
    if (match[1] !== "id") fks.push(match[1]);
  }
  return [...new Set(fks)];
}

function classify(
  name: string,
  body: string,
  fks: string[]
): { classification: Classification; tenantPath: string; notes: string } {
  if (GLOBAL_MODELS.has(name)) {
    const bypassNote = BYPASSRLS_NOTES[name];
    if (bypassNote) {
      return { classification: "GLOBAL", tenantPath: "userId → User", notes: bypassNote };
    }
    const isNextAuth = name === "Account" || name === "Session";
    return {
      classification: "GLOBAL",
      tenantPath: "none",
      notes: isNextAuth ? "NextAuth-managed; query via admin_user client" : "",
    };
  }

  if (AMBIGUOUS_MODELS.has(name)) {
    return {
      classification: "AMBIGUOUS",
      tenantPath: "requires schema addition",
      notes: "Add organizationId column before enabling RLS",
    };
  }

  if (USER_OWNED_MODELS.has(name)) {
    return {
      classification: "USER_OWNED",
      tenantPath: "userId → User",
      notes: "Policy uses app.current_user_id session variable",
    };
  }

  const hasOrg = fks.includes("organizationId") || /organizationId\s+String/.test(body);

  if (hasOrg) {
    const isPublic = /isPublic/.test(body);
    return {
      classification: "TENANT_DIRECT",
      tenantPath: "organizationId",
      notes: isPublic ? "Has isPublic flag — use tenant-direct-public template" : "",
    };
  }

  // TENANT_INDIRECT — resolve path
  if (fks.includes("agentId") || fks.includes("callerAgentId")) {
    const fkCol = fks.includes("agentId") ? "agentId" : "callerAgentId";
    return {
      classification: "TENANT_INDIRECT",
      tenantPath: `${fkCol} → Agent.organizationId`,
      notes: "",
    };
  }

  if (fks.includes("flowId")) {
    return {
      classification: "TENANT_INDIRECT",
      tenantPath: "flowId → Flow.agentId → Agent.organizationId",
      notes: "",
    };
  }

  if (fks.includes("knowledgeBaseId")) {
    return {
      classification: "TENANT_INDIRECT",
      tenantPath: "knowledgeBaseId → KnowledgeBase.agentId → Agent.organizationId",
      notes: "",
    };
  }

  if (fks.includes("conversationId")) {
    return {
      classification: "TENANT_INDIRECT",
      tenantPath: "conversationId → Conversation.agentId → Agent.organizationId",
      notes: "",
    };
  }

  if (fks.includes("webhookConfigId")) {
    return {
      classification: "TENANT_INDIRECT",
      tenantPath: "webhookConfigId → WebhookConfig.agentId → Agent.organizationId",
      notes: "",
    };
  }

  if (fks.includes("flowScheduleId")) {
    return {
      classification: "TENANT_INDIRECT",
      tenantPath: "flowScheduleId → FlowSchedule.agentId → Agent.organizationId",
      notes: "",
    };
  }

  if (fks.includes("suiteId")) {
    return {
      classification: "TENANT_INDIRECT",
      tenantPath: "suiteId → EvalSuite.agentId → Agent.organizationId",
      notes: "",
    };
  }

  if (fks.includes("runId")) {
    return {
      classification: "TENANT_INDIRECT",
      tenantPath: "runId → EvalRun → suiteId → EvalSuite.agentId → Agent.organizationId",
      notes: "Two-hop FK chain — verify with EXPLAIN ANALYZE",
    };
  }

  if (fks.includes("sourceId")) {
    return {
      classification: "TENANT_INDIRECT",
      tenantPath: "sourceId → KBSource → knowledgeBaseId → KnowledgeBase.agentId",
      notes: "Three-hop FK chain",
    };
  }

  if (fks.includes("budgetId")) {
    return {
      classification: "TENANT_INDIRECT",
      tenantPath: "budgetId → AgentBudget.agentId → Agent.organizationId",
      notes: "",
    };
  }

  if (fks.includes("goalId")) {
    return {
      classification: "TENANT_INDIRECT",
      tenantPath: "goalId → Goal.organizationId",
      notes: "",
    };
  }

  if (fks.includes("policyId")) {
    return {
      classification: "TENANT_INDIRECT",
      tenantPath: "policyId → ApprovalPolicy.organizationId",
      notes: "",
    };
  }

  return {
    classification: "AMBIGUOUS",
    tenantPath: "unknown",
    notes: "No clear tenant path — review manually",
  };
}

function run(): void {
  const isDryRun = process.argv.includes("--dry-run");
  const schema = readFileSync(SCHEMA_PATH, "utf-8");
  const rawModels = parseSchemaModels(schema);

  const records: ModelRecord[] = rawModels.map(({ name, body, line }) => {
    const fks = extractFKs(body);
    const { classification, tenantPath, notes } = classify(name, body, fks);

    return {
      name,
      line,
      classification,
      fkColumns: fks,
      hasOrganizationId: fks.includes("organizationId") || /organizationId\s+String/.test(body),
      hasUserId: fks.includes("userId"),
      hasIsPublic: /isPublic/.test(body),
      tenantPath,
      notes,
    };
  });

  const grouped: Record<Classification, ModelRecord[]> = {
    TENANT_DIRECT: [],
    TENANT_INDIRECT: [],
    USER_OWNED: [],
    GLOBAL: [],
    AMBIGUOUS: [],
  };

  for (const r of records) grouped[r.classification].push(r);

  const summary = {
    generatedAt: new Date().toISOString(),
    schemaPath: "prisma/schema.prisma",
    totalModels: records.length,
    counts: Object.fromEntries(
      Object.entries(grouped).map(([k, v]) => [k, v.length])
    ),
    models: records,
  };

  if (isDryRun) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2));
  console.log(`✓ Written: ${OUT_JSON}`);
  console.log("");
  console.log("Summary:");
  for (const [cls, count] of Object.entries(summary.counts)) {
    const models = grouped[cls as Classification].map((r) => r.name).join(", ");
    console.log(`  ${cls.padEnd(18)} ${String(count).padStart(2)} models: ${models}`);
  }
}

run();
