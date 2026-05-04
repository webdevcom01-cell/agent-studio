-- ============================================================================
-- F0.8 — Row-Level Security (RLS) for tenant isolation
--
-- This is APPLICATION-ENFORCED RLS, not a substitute for API authentication.
-- Every request must still pass through auth-guard.ts before reaching the DB.
-- RLS is a defence-in-depth layer: if a query forgets a WHERE clause, the DB
-- automatically filters rows to the current org.
--
-- How it works:
--   1. Before each query, the app calls:
--        SELECT set_config('app.current_org_id', '<orgId>', true)
--   2. The RLS policies below filter rows using that session variable.
--   3. The admin DB role (DATABASE_URL connection) has BYPASSRLS and is
--      unaffected — cron jobs and migrations run without restriction.
--
-- IMPORTANT: Only tables with an actual `organizationId` column are covered.
-- Tables listed in the F0.8 spec that do NOT yet have the column are noted
-- below as pending — add them here after the schema migration adds the column.
--
-- Current schema coverage (2024-01-08):
--   ✅ Agent             — has organizationId (nullable)
--   ❌ Flow              — isolate via Agent FK (no direct organizationId)
--   ❌ KnowledgeBase     — isolate via Agent FK
--   ❌ FlowSchedule      — no organizationId column yet
--   ❌ WebhookConfig     — no organizationId column yet
--   ❌ EvalSuite         — no organizationId column yet
--   ❌ EvalRun           — no organizationId column yet
--   ❌ EvalResult        — no organizationId column yet
--   ❌ AuditLog          — no organizationId column yet
--   ❌ ApiKey            — no organizationId column yet
--   ❌ MCPServer         — no organizationId column yet
--   ❌ AgentSkillPermission — no organizationId column yet
-- ============================================================================

-- ── Enable RLS on Agent ──────────────────────────────────────────────────────
ALTER TABLE "Agent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Agent" FORCE ROW LEVEL SECURITY;

-- Allow admin role (DATABASE_URL) to bypass RLS for cron jobs and migrations.
-- The role name 'postgres' is the Railway default; adjust if your DB role differs.
ALTER TABLE "Agent" OWNER TO postgres;

-- SELECT: return rows where organizationId matches the current session org,
-- OR rows with no org (personal agents owned by the requesting user).
-- When app.current_org_id is not set, current_setting returns '' (empty string).
CREATE POLICY "agent_select_policy" ON "Agent"
  FOR SELECT
  USING (
    "organizationId" = current_setting('app.current_org_id', true)
    OR (
      "organizationId" IS NULL
      AND current_setting('app.current_org_id', true) IS DISTINCT FROM ''
    )
  );

-- INSERT: only allow inserting agents into the current org.
CREATE POLICY "agent_insert_policy" ON "Agent"
  FOR INSERT
  WITH CHECK (
    "organizationId" = current_setting('app.current_org_id', true)
    OR "organizationId" IS NULL
  );

-- UPDATE: can only update agents that belong to the current org.
CREATE POLICY "agent_update_policy" ON "Agent"
  FOR UPDATE
  USING (
    "organizationId" = current_setting('app.current_org_id', true)
    OR "organizationId" IS NULL
  )
  WITH CHECK (
    "organizationId" = current_setting('app.current_org_id', true)
    OR "organizationId" IS NULL
  );

-- DELETE: can only delete agents that belong to the current org.
CREATE POLICY "agent_delete_policy" ON "Agent"
  FOR DELETE
  USING (
    "organizationId" = current_setting('app.current_org_id', true)
    OR "organizationId" IS NULL
  );

-- ── Pending tables — add RLS after adding organizationId column ──────────────
-- Run a schema migration first to add `organizationId String?` to each table,
-- then add ENABLE ROW LEVEL SECURITY + policies here using the same pattern.
--
-- Priority order (highest tenant-leakage risk first):
--   1. Flow          — child of Agent, leaks flow content across orgs
--   2. KnowledgeBase — child of Agent, leaks KB documents
--   3. WebhookConfig — can exfiltrate data to external URLs
--   4. AuditLog      — contains sensitive org activity
--   5. ApiKey        — scoped to users, but org context needed
