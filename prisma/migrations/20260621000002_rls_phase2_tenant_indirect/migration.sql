-- =============================================================================
-- Phase 2 (TENANT_INDIRECT) — COMBINED RLS migration (STAGING-FIRST)
-- =============================================================================
-- 28 pending tables = 20 single-hop (Part A, generated) + 8 multi-hop
-- (Part B, hand-authored & schema-verified). 7 already-RLS tables are skipped.
--
-- Fully idempotent (CREATE INDEX IF NOT EXISTS / ENABLE+FORCE / GRANT /
-- DROP POLICY IF EXISTS before CREATE) — safe to re-run.
--
-- !! NOT YET a prisma migration. DATABASE_URL defaults to PROD, so this file
-- is kept OUT of prisma/migrations/ on purpose. To apply to STAGING:
--   mkdir -p prisma/migrations/20260621000002_rls_phase2_tenant_indirect
--   cp skills/rls-rollout/reference/phase2-combined-migration.sql \
--      prisma/migrations/20260621000002_rls_phase2_tenant_indirect/migration.sql
--   DATABASE_URL=$STAGING_URL pnpm prisma migrate deploy
--   bash skills/rls-rollout/scripts/verify-staging.sh --phase=2
-- Only commit the migration (→ CI applies to prod) AFTER staging + STEP 4 pass.
-- =============================================================================


-- #############################################################################
-- PART A — 20 single-hop tables (agentId -> Agent.organizationId)
-- #############################################################################

-- =============================================================================
-- Model: ManagedAgentTask (via agentId → Agent.organizationId)
-- =============================================================================
-- =========================================================================
-- TENANT_INDIRECT policy template (cascaded via FK)
-- =========================================================================
-- Use for tables that don't have organizationId directly but reach it via
-- a foreign key chain (typically agentId → Agent.organizationId).
--
-- Placeholders:
--   ManagedAgentTask      — PascalCase model name (e.g., "Flow")
--   managedagenttask     — lowercase form (e.g., "flow")
--   agentId       — FK column name (e.g., "agentId")
--   Agent    — Parent table name (e.g., "Agent")
--   organizationId — Parent's tenant column (e.g., "organizationId")

-- 1. Index on FK column (often already exists via @relation)
CREATE INDEX IF NOT EXISTS "ManagedAgentTask_agentId_id_idx"
  ON "ManagedAgentTask" ("agentId", "id");

-- 2. Enable RLS
ALTER TABLE "ManagedAgentTask" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ManagedAgentTask" FORCE ROW LEVEL SECURITY;

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "ManagedAgentTask" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ManagedAgentTask" TO admin_user;

-- 4. Policies — subquery against parent
-- Idempotent: drop existing same-named policies first so this migration is
-- safe to re-run and safe on partially-migrated tables.
DROP POLICY IF EXISTS managedagenttask_select ON "ManagedAgentTask";
DROP POLICY IF EXISTS managedagenttask_insert ON "ManagedAgentTask";
DROP POLICY IF EXISTS managedagenttask_update ON "ManagedAgentTask";
DROP POLICY IF EXISTS managedagenttask_delete ON "ManagedAgentTask";

CREATE POLICY managedagenttask_select ON "ManagedAgentTask"
  FOR SELECT TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY managedagenttask_insert ON "ManagedAgentTask"
  FOR INSERT TO app_user
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY managedagenttask_update ON "ManagedAgentTask"
  FOR UPDATE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  )
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY managedagenttask_delete ON "ManagedAgentTask"
  FOR DELETE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

-- =========================================================================
-- Performance note
-- =========================================================================
-- The subquery is re-evaluated per row. If the parent table is large and the
-- FK column isn't indexed, expect 10-100x slowdown. Ensure:
--   1. Index on "ManagedAgentTask"."agentId" (declared in this template)
--   2. Composite index on "Agent"("organizationId", "id")
--      (declared in the parent's TENANT_DIRECT migration)

-- =========================================================================
-- Rollback
-- =========================================================================
-- DROP POLICY IF EXISTS managedagenttask_select ON "ManagedAgentTask";
-- DROP POLICY IF EXISTS managedagenttask_insert ON "ManagedAgentTask";
-- DROP POLICY IF EXISTS managedagenttask_update ON "ManagedAgentTask";
-- DROP POLICY IF EXISTS managedagenttask_delete ON "ManagedAgentTask";
-- ALTER TABLE "ManagedAgentTask" DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Model: PipelineRun (via agentId → Agent.organizationId)
-- =============================================================================
-- =========================================================================
-- TENANT_INDIRECT policy template (cascaded via FK)
-- =========================================================================
-- Use for tables that don't have organizationId directly but reach it via
-- a foreign key chain (typically agentId → Agent.organizationId).
--
-- Placeholders:
--   PipelineRun      — PascalCase model name (e.g., "Flow")
--   pipelinerun     — lowercase form (e.g., "flow")
--   agentId       — FK column name (e.g., "agentId")
--   Agent    — Parent table name (e.g., "Agent")
--   organizationId — Parent's tenant column (e.g., "organizationId")

-- 1. Index on FK column (often already exists via @relation)
CREATE INDEX IF NOT EXISTS "PipelineRun_agentId_id_idx"
  ON "PipelineRun" ("agentId", "id");

-- 2. Enable RLS
ALTER TABLE "PipelineRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PipelineRun" FORCE ROW LEVEL SECURITY;

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "PipelineRun" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PipelineRun" TO admin_user;

-- 4. Policies — subquery against parent
-- Idempotent: drop existing same-named policies first so this migration is
-- safe to re-run and safe on partially-migrated tables.
DROP POLICY IF EXISTS pipelinerun_select ON "PipelineRun";
DROP POLICY IF EXISTS pipelinerun_insert ON "PipelineRun";
DROP POLICY IF EXISTS pipelinerun_update ON "PipelineRun";
DROP POLICY IF EXISTS pipelinerun_delete ON "PipelineRun";

CREATE POLICY pipelinerun_select ON "PipelineRun"
  FOR SELECT TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY pipelinerun_insert ON "PipelineRun"
  FOR INSERT TO app_user
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY pipelinerun_update ON "PipelineRun"
  FOR UPDATE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  )
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY pipelinerun_delete ON "PipelineRun"
  FOR DELETE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

-- =========================================================================
-- Performance note
-- =========================================================================
-- The subquery is re-evaluated per row. If the parent table is large and the
-- FK column isn't indexed, expect 10-100x slowdown. Ensure:
--   1. Index on "PipelineRun"."agentId" (declared in this template)
--   2. Composite index on "Agent"("organizationId", "id")
--      (declared in the parent's TENANT_DIRECT migration)

-- =========================================================================
-- Rollback
-- =========================================================================
-- DROP POLICY IF EXISTS pipelinerun_select ON "PipelineRun";
-- DROP POLICY IF EXISTS pipelinerun_insert ON "PipelineRun";
-- DROP POLICY IF EXISTS pipelinerun_update ON "PipelineRun";
-- DROP POLICY IF EXISTS pipelinerun_delete ON "PipelineRun";
-- ALTER TABLE "PipelineRun" DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Model: PipelineMemory (via agentId → Agent.organizationId)
-- =============================================================================
-- =========================================================================
-- TENANT_INDIRECT policy template (cascaded via FK)
-- =========================================================================
-- Use for tables that don't have organizationId directly but reach it via
-- a foreign key chain (typically agentId → Agent.organizationId).
--
-- Placeholders:
--   PipelineMemory      — PascalCase model name (e.g., "Flow")
--   pipelinememory     — lowercase form (e.g., "flow")
--   agentId       — FK column name (e.g., "agentId")
--   Agent    — Parent table name (e.g., "Agent")
--   organizationId — Parent's tenant column (e.g., "organizationId")

-- 1. Index on FK column (often already exists via @relation)
CREATE INDEX IF NOT EXISTS "PipelineMemory_agentId_id_idx"
  ON "PipelineMemory" ("agentId", "id");

-- 2. Enable RLS
ALTER TABLE "PipelineMemory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PipelineMemory" FORCE ROW LEVEL SECURITY;

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "PipelineMemory" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PipelineMemory" TO admin_user;

-- 4. Policies — subquery against parent
-- Idempotent: drop existing same-named policies first so this migration is
-- safe to re-run and safe on partially-migrated tables.
DROP POLICY IF EXISTS pipelinememory_select ON "PipelineMemory";
DROP POLICY IF EXISTS pipelinememory_insert ON "PipelineMemory";
DROP POLICY IF EXISTS pipelinememory_update ON "PipelineMemory";
DROP POLICY IF EXISTS pipelinememory_delete ON "PipelineMemory";

CREATE POLICY pipelinememory_select ON "PipelineMemory"
  FOR SELECT TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY pipelinememory_insert ON "PipelineMemory"
  FOR INSERT TO app_user
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY pipelinememory_update ON "PipelineMemory"
  FOR UPDATE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  )
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY pipelinememory_delete ON "PipelineMemory"
  FOR DELETE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

-- =========================================================================
-- Performance note
-- =========================================================================
-- The subquery is re-evaluated per row. If the parent table is large and the
-- FK column isn't indexed, expect 10-100x slowdown. Ensure:
--   1. Index on "PipelineMemory"."agentId" (declared in this template)
--   2. Composite index on "Agent"("organizationId", "id")
--      (declared in the parent's TENANT_DIRECT migration)

-- =========================================================================
-- Rollback
-- =========================================================================
-- DROP POLICY IF EXISTS pipelinememory_select ON "PipelineMemory";
-- DROP POLICY IF EXISTS pipelinememory_insert ON "PipelineMemory";
-- DROP POLICY IF EXISTS pipelinememory_update ON "PipelineMemory";
-- DROP POLICY IF EXISTS pipelinememory_delete ON "PipelineMemory";
-- ALTER TABLE "PipelineMemory" DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Model: AgentSdkSession (via agentId → Agent.organizationId)
-- =============================================================================
-- =========================================================================
-- TENANT_INDIRECT policy template (cascaded via FK)
-- =========================================================================
-- Use for tables that don't have organizationId directly but reach it via
-- a foreign key chain (typically agentId → Agent.organizationId).
--
-- Placeholders:
--   AgentSdkSession      — PascalCase model name (e.g., "Flow")
--   agentsdksession     — lowercase form (e.g., "flow")
--   agentId       — FK column name (e.g., "agentId")
--   Agent    — Parent table name (e.g., "Agent")
--   organizationId — Parent's tenant column (e.g., "organizationId")

-- 1. Index on FK column (often already exists via @relation)
CREATE INDEX IF NOT EXISTS "AgentSdkSession_agentId_id_idx"
  ON "AgentSdkSession" ("agentId", "id");

-- 2. Enable RLS
ALTER TABLE "AgentSdkSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentSdkSession" FORCE ROW LEVEL SECURITY;

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentSdkSession" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentSdkSession" TO admin_user;

-- 4. Policies — subquery against parent
-- Idempotent: drop existing same-named policies first so this migration is
-- safe to re-run and safe on partially-migrated tables.
DROP POLICY IF EXISTS agentsdksession_select ON "AgentSdkSession";
DROP POLICY IF EXISTS agentsdksession_insert ON "AgentSdkSession";
DROP POLICY IF EXISTS agentsdksession_update ON "AgentSdkSession";
DROP POLICY IF EXISTS agentsdksession_delete ON "AgentSdkSession";

CREATE POLICY agentsdksession_select ON "AgentSdkSession"
  FOR SELECT TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY agentsdksession_insert ON "AgentSdkSession"
  FOR INSERT TO app_user
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY agentsdksession_update ON "AgentSdkSession"
  FOR UPDATE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  )
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY agentsdksession_delete ON "AgentSdkSession"
  FOR DELETE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

-- =========================================================================
-- Performance note
-- =========================================================================
-- The subquery is re-evaluated per row. If the parent table is large and the
-- FK column isn't indexed, expect 10-100x slowdown. Ensure:
--   1. Index on "AgentSdkSession"."agentId" (declared in this template)
--   2. Composite index on "Agent"("organizationId", "id")
--      (declared in the parent's TENANT_DIRECT migration)

-- =========================================================================
-- Rollback
-- =========================================================================
-- DROP POLICY IF EXISTS agentsdksession_select ON "AgentSdkSession";
-- DROP POLICY IF EXISTS agentsdksession_insert ON "AgentSdkSession";
-- DROP POLICY IF EXISTS agentsdksession_update ON "AgentSdkSession";
-- DROP POLICY IF EXISTS agentsdksession_delete ON "AgentSdkSession";
-- ALTER TABLE "AgentSdkSession" DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Model: AnalyticsEvent (via agentId → Agent.organizationId)
-- =============================================================================
-- =========================================================================
-- TENANT_INDIRECT policy template (cascaded via FK)
-- =========================================================================
-- Use for tables that don't have organizationId directly but reach it via
-- a foreign key chain (typically agentId → Agent.organizationId).
--
-- Placeholders:
--   AnalyticsEvent      — PascalCase model name (e.g., "Flow")
--   analyticsevent     — lowercase form (e.g., "flow")
--   agentId       — FK column name (e.g., "agentId")
--   Agent    — Parent table name (e.g., "Agent")
--   organizationId — Parent's tenant column (e.g., "organizationId")

-- 1. Index on FK column (often already exists via @relation)
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_agentId_id_idx"
  ON "AnalyticsEvent" ("agentId", "id");

-- 2. Enable RLS
ALTER TABLE "AnalyticsEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnalyticsEvent" FORCE ROW LEVEL SECURITY;

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "AnalyticsEvent" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AnalyticsEvent" TO admin_user;

-- 4. Policies — subquery against parent
-- Idempotent: drop existing same-named policies first so this migration is
-- safe to re-run and safe on partially-migrated tables.
DROP POLICY IF EXISTS analyticsevent_select ON "AnalyticsEvent";
DROP POLICY IF EXISTS analyticsevent_insert ON "AnalyticsEvent";
DROP POLICY IF EXISTS analyticsevent_update ON "AnalyticsEvent";
DROP POLICY IF EXISTS analyticsevent_delete ON "AnalyticsEvent";

CREATE POLICY analyticsevent_select ON "AnalyticsEvent"
  FOR SELECT TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY analyticsevent_insert ON "AnalyticsEvent"
  FOR INSERT TO app_user
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY analyticsevent_update ON "AnalyticsEvent"
  FOR UPDATE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  )
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY analyticsevent_delete ON "AnalyticsEvent"
  FOR DELETE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

-- =========================================================================
-- Performance note
-- =========================================================================
-- The subquery is re-evaluated per row. If the parent table is large and the
-- FK column isn't indexed, expect 10-100x slowdown. Ensure:
--   1. Index on "AnalyticsEvent"."agentId" (declared in this template)
--   2. Composite index on "Agent"("organizationId", "id")
--      (declared in the parent's TENANT_DIRECT migration)

-- =========================================================================
-- Rollback
-- =========================================================================
-- DROP POLICY IF EXISTS analyticsevent_select ON "AnalyticsEvent";
-- DROP POLICY IF EXISTS analyticsevent_insert ON "AnalyticsEvent";
-- DROP POLICY IF EXISTS analyticsevent_update ON "AnalyticsEvent";
-- DROP POLICY IF EXISTS analyticsevent_delete ON "AnalyticsEvent";
-- ALTER TABLE "AnalyticsEvent" DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Model: Conversation (via agentId → Agent.organizationId)
-- =============================================================================
-- =========================================================================
-- TENANT_INDIRECT policy template (cascaded via FK)
-- =========================================================================
-- Use for tables that don't have organizationId directly but reach it via
-- a foreign key chain (typically agentId → Agent.organizationId).
--
-- Placeholders:
--   Conversation      — PascalCase model name (e.g., "Flow")
--   conversation     — lowercase form (e.g., "flow")
--   agentId       — FK column name (e.g., "agentId")
--   Agent    — Parent table name (e.g., "Agent")
--   organizationId — Parent's tenant column (e.g., "organizationId")

-- 1. Index on FK column (often already exists via @relation)
CREATE INDEX IF NOT EXISTS "Conversation_agentId_id_idx"
  ON "Conversation" ("agentId", "id");

-- 2. Enable RLS
ALTER TABLE "Conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Conversation" FORCE ROW LEVEL SECURITY;

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "Conversation" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Conversation" TO admin_user;

-- 4. Policies — subquery against parent
-- Idempotent: drop existing same-named policies first so this migration is
-- safe to re-run and safe on partially-migrated tables.
DROP POLICY IF EXISTS conversation_select ON "Conversation";
DROP POLICY IF EXISTS conversation_insert ON "Conversation";
DROP POLICY IF EXISTS conversation_update ON "Conversation";
DROP POLICY IF EXISTS conversation_delete ON "Conversation";

CREATE POLICY conversation_select ON "Conversation"
  FOR SELECT TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY conversation_insert ON "Conversation"
  FOR INSERT TO app_user
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY conversation_update ON "Conversation"
  FOR UPDATE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  )
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY conversation_delete ON "Conversation"
  FOR DELETE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

-- =========================================================================
-- Performance note
-- =========================================================================
-- The subquery is re-evaluated per row. If the parent table is large and the
-- FK column isn't indexed, expect 10-100x slowdown. Ensure:
--   1. Index on "Conversation"."agentId" (declared in this template)
--   2. Composite index on "Agent"("organizationId", "id")
--      (declared in the parent's TENANT_DIRECT migration)

-- =========================================================================
-- Rollback
-- =========================================================================
-- DROP POLICY IF EXISTS conversation_select ON "Conversation";
-- DROP POLICY IF EXISTS conversation_insert ON "Conversation";
-- DROP POLICY IF EXISTS conversation_update ON "Conversation";
-- DROP POLICY IF EXISTS conversation_delete ON "Conversation";
-- ALTER TABLE "Conversation" DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Model: AgentMCPServer (via agentId → Agent.organizationId)
-- =============================================================================
-- =========================================================================
-- TENANT_INDIRECT policy template (cascaded via FK)
-- =========================================================================
-- Use for tables that don't have organizationId directly but reach it via
-- a foreign key chain (typically agentId → Agent.organizationId).
--
-- Placeholders:
--   AgentMCPServer      — PascalCase model name (e.g., "Flow")
--   agentmcpserver     — lowercase form (e.g., "flow")
--   agentId       — FK column name (e.g., "agentId")
--   Agent    — Parent table name (e.g., "Agent")
--   organizationId — Parent's tenant column (e.g., "organizationId")

-- 1. Index on FK column (often already exists via @relation)
CREATE INDEX IF NOT EXISTS "AgentMCPServer_agentId_id_idx"
  ON "AgentMCPServer" ("agentId", "id");

-- 2. Enable RLS
ALTER TABLE "AgentMCPServer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentMCPServer" FORCE ROW LEVEL SECURITY;

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentMCPServer" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentMCPServer" TO admin_user;

-- 4. Policies — subquery against parent
-- Idempotent: drop existing same-named policies first so this migration is
-- safe to re-run and safe on partially-migrated tables.
DROP POLICY IF EXISTS agentmcpserver_select ON "AgentMCPServer";
DROP POLICY IF EXISTS agentmcpserver_insert ON "AgentMCPServer";
DROP POLICY IF EXISTS agentmcpserver_update ON "AgentMCPServer";
DROP POLICY IF EXISTS agentmcpserver_delete ON "AgentMCPServer";

CREATE POLICY agentmcpserver_select ON "AgentMCPServer"
  FOR SELECT TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY agentmcpserver_insert ON "AgentMCPServer"
  FOR INSERT TO app_user
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY agentmcpserver_update ON "AgentMCPServer"
  FOR UPDATE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  )
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY agentmcpserver_delete ON "AgentMCPServer"
  FOR DELETE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

-- =========================================================================
-- Performance note
-- =========================================================================
-- The subquery is re-evaluated per row. If the parent table is large and the
-- FK column isn't indexed, expect 10-100x slowdown. Ensure:
--   1. Index on "AgentMCPServer"."agentId" (declared in this template)
--   2. Composite index on "Agent"("organizationId", "id")
--      (declared in the parent's TENANT_DIRECT migration)

-- =========================================================================
-- Rollback
-- =========================================================================
-- DROP POLICY IF EXISTS agentmcpserver_select ON "AgentMCPServer";
-- DROP POLICY IF EXISTS agentmcpserver_insert ON "AgentMCPServer";
-- DROP POLICY IF EXISTS agentmcpserver_update ON "AgentMCPServer";
-- DROP POLICY IF EXISTS agentmcpserver_delete ON "AgentMCPServer";
-- ALTER TABLE "AgentMCPServer" DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Model: FlowDeployment (via agentId → Agent.organizationId)
-- =============================================================================
-- =========================================================================
-- TENANT_INDIRECT policy template (cascaded via FK)
-- =========================================================================
-- Use for tables that don't have organizationId directly but reach it via
-- a foreign key chain (typically agentId → Agent.organizationId).
--
-- Placeholders:
--   FlowDeployment      — PascalCase model name (e.g., "Flow")
--   flowdeployment     — lowercase form (e.g., "flow")
--   agentId       — FK column name (e.g., "agentId")
--   Agent    — Parent table name (e.g., "Agent")
--   organizationId — Parent's tenant column (e.g., "organizationId")

-- 1. Index on FK column (often already exists via @relation)
CREATE INDEX IF NOT EXISTS "FlowDeployment_agentId_id_idx"
  ON "FlowDeployment" ("agentId", "id");

-- 2. Enable RLS
ALTER TABLE "FlowDeployment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FlowDeployment" FORCE ROW LEVEL SECURITY;

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "FlowDeployment" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "FlowDeployment" TO admin_user;

-- 4. Policies — subquery against parent
-- Idempotent: drop existing same-named policies first so this migration is
-- safe to re-run and safe on partially-migrated tables.
DROP POLICY IF EXISTS flowdeployment_select ON "FlowDeployment";
DROP POLICY IF EXISTS flowdeployment_insert ON "FlowDeployment";
DROP POLICY IF EXISTS flowdeployment_update ON "FlowDeployment";
DROP POLICY IF EXISTS flowdeployment_delete ON "FlowDeployment";

CREATE POLICY flowdeployment_select ON "FlowDeployment"
  FOR SELECT TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY flowdeployment_insert ON "FlowDeployment"
  FOR INSERT TO app_user
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY flowdeployment_update ON "FlowDeployment"
  FOR UPDATE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  )
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY flowdeployment_delete ON "FlowDeployment"
  FOR DELETE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

-- =========================================================================
-- Performance note
-- =========================================================================
-- The subquery is re-evaluated per row. If the parent table is large and the
-- FK column isn't indexed, expect 10-100x slowdown. Ensure:
--   1. Index on "FlowDeployment"."agentId" (declared in this template)
--   2. Composite index on "Agent"("organizationId", "id")
--      (declared in the parent's TENANT_DIRECT migration)

-- =========================================================================
-- Rollback
-- =========================================================================
-- DROP POLICY IF EXISTS flowdeployment_select ON "FlowDeployment";
-- DROP POLICY IF EXISTS flowdeployment_insert ON "FlowDeployment";
-- DROP POLICY IF EXISTS flowdeployment_update ON "FlowDeployment";
-- DROP POLICY IF EXISTS flowdeployment_delete ON "FlowDeployment";
-- ALTER TABLE "FlowDeployment" DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Model: AgentCard (via agentId → Agent.organizationId)
-- =============================================================================
-- =========================================================================
-- TENANT_INDIRECT policy template (cascaded via FK)
-- =========================================================================
-- Use for tables that don't have organizationId directly but reach it via
-- a foreign key chain (typically agentId → Agent.organizationId).
--
-- Placeholders:
--   AgentCard      — PascalCase model name (e.g., "Flow")
--   agentcard     — lowercase form (e.g., "flow")
--   agentId       — FK column name (e.g., "agentId")
--   Agent    — Parent table name (e.g., "Agent")
--   organizationId — Parent's tenant column (e.g., "organizationId")

-- 1. Index on FK column (often already exists via @relation)
CREATE INDEX IF NOT EXISTS "AgentCard_agentId_id_idx"
  ON "AgentCard" ("agentId", "id");

-- 2. Enable RLS
ALTER TABLE "AgentCard" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentCard" FORCE ROW LEVEL SECURITY;

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentCard" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentCard" TO admin_user;

-- 4. Policies — subquery against parent
-- Idempotent: drop existing same-named policies first so this migration is
-- safe to re-run and safe on partially-migrated tables.
DROP POLICY IF EXISTS agentcard_select ON "AgentCard";
DROP POLICY IF EXISTS agentcard_insert ON "AgentCard";
DROP POLICY IF EXISTS agentcard_update ON "AgentCard";
DROP POLICY IF EXISTS agentcard_delete ON "AgentCard";

CREATE POLICY agentcard_select ON "AgentCard"
  FOR SELECT TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY agentcard_insert ON "AgentCard"
  FOR INSERT TO app_user
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY agentcard_update ON "AgentCard"
  FOR UPDATE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  )
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY agentcard_delete ON "AgentCard"
  FOR DELETE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

-- =========================================================================
-- Performance note
-- =========================================================================
-- The subquery is re-evaluated per row. If the parent table is large and the
-- FK column isn't indexed, expect 10-100x slowdown. Ensure:
--   1. Index on "AgentCard"."agentId" (declared in this template)
--   2. Composite index on "Agent"("organizationId", "id")
--      (declared in the parent's TENANT_DIRECT migration)

-- =========================================================================
-- Rollback
-- =========================================================================
-- DROP POLICY IF EXISTS agentcard_select ON "AgentCard";
-- DROP POLICY IF EXISTS agentcard_insert ON "AgentCard";
-- DROP POLICY IF EXISTS agentcard_update ON "AgentCard";
-- DROP POLICY IF EXISTS agentcard_delete ON "AgentCard";
-- ALTER TABLE "AgentCard" DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Model: HumanApprovalRequest (via agentId → Agent.organizationId)
-- =============================================================================
-- =========================================================================
-- TENANT_INDIRECT policy template (cascaded via FK)
-- =========================================================================
-- Use for tables that don't have organizationId directly but reach it via
-- a foreign key chain (typically agentId → Agent.organizationId).
--
-- Placeholders:
--   HumanApprovalRequest      — PascalCase model name (e.g., "Flow")
--   humanapprovalrequest     — lowercase form (e.g., "flow")
--   agentId       — FK column name (e.g., "agentId")
--   Agent    — Parent table name (e.g., "Agent")
--   organizationId — Parent's tenant column (e.g., "organizationId")

-- 1. Index on FK column (often already exists via @relation)
CREATE INDEX IF NOT EXISTS "HumanApprovalRequest_agentId_id_idx"
  ON "HumanApprovalRequest" ("agentId", "id");

-- 2. Enable RLS
ALTER TABLE "HumanApprovalRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HumanApprovalRequest" FORCE ROW LEVEL SECURITY;

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "HumanApprovalRequest" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "HumanApprovalRequest" TO admin_user;

-- 4. Policies — subquery against parent
-- Idempotent: drop existing same-named policies first so this migration is
-- safe to re-run and safe on partially-migrated tables.
DROP POLICY IF EXISTS humanapprovalrequest_select ON "HumanApprovalRequest";
DROP POLICY IF EXISTS humanapprovalrequest_insert ON "HumanApprovalRequest";
DROP POLICY IF EXISTS humanapprovalrequest_update ON "HumanApprovalRequest";
DROP POLICY IF EXISTS humanapprovalrequest_delete ON "HumanApprovalRequest";

CREATE POLICY humanapprovalrequest_select ON "HumanApprovalRequest"
  FOR SELECT TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY humanapprovalrequest_insert ON "HumanApprovalRequest"
  FOR INSERT TO app_user
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY humanapprovalrequest_update ON "HumanApprovalRequest"
  FOR UPDATE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  )
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY humanapprovalrequest_delete ON "HumanApprovalRequest"
  FOR DELETE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

-- =========================================================================
-- Performance note
-- =========================================================================
-- The subquery is re-evaluated per row. If the parent table is large and the
-- FK column isn't indexed, expect 10-100x slowdown. Ensure:
--   1. Index on "HumanApprovalRequest"."agentId" (declared in this template)
--   2. Composite index on "Agent"("organizationId", "id")
--      (declared in the parent's TENANT_DIRECT migration)

-- =========================================================================
-- Rollback
-- =========================================================================
-- DROP POLICY IF EXISTS humanapprovalrequest_select ON "HumanApprovalRequest";
-- DROP POLICY IF EXISTS humanapprovalrequest_insert ON "HumanApprovalRequest";
-- DROP POLICY IF EXISTS humanapprovalrequest_update ON "HumanApprovalRequest";
-- DROP POLICY IF EXISTS humanapprovalrequest_delete ON "HumanApprovalRequest";
-- ALTER TABLE "HumanApprovalRequest" DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Model: AgentCallLog (via callerAgentId → Agent.organizationId)
-- =============================================================================
-- =========================================================================
-- TENANT_INDIRECT policy template (cascaded via FK)
-- =========================================================================
-- Use for tables that don't have organizationId directly but reach it via
-- a foreign key chain (typically agentId → Agent.organizationId).
--
-- Placeholders:
--   AgentCallLog      — PascalCase model name (e.g., "Flow")
--   agentcalllog     — lowercase form (e.g., "flow")
--   callerAgentId       — FK column name (e.g., "agentId")
--   Agent    — Parent table name (e.g., "Agent")
--   organizationId — Parent's tenant column (e.g., "organizationId")

-- 1. Index on FK column (often already exists via @relation)
CREATE INDEX IF NOT EXISTS "AgentCallLog_callerAgentId_id_idx"
  ON "AgentCallLog" ("callerAgentId", "id");

-- 2. Enable RLS
ALTER TABLE "AgentCallLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentCallLog" FORCE ROW LEVEL SECURITY;

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentCallLog" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentCallLog" TO admin_user;

-- 4. Policies — subquery against parent
-- Idempotent: drop existing same-named policies first so this migration is
-- safe to re-run and safe on partially-migrated tables.
DROP POLICY IF EXISTS agentcalllog_select ON "AgentCallLog";
DROP POLICY IF EXISTS agentcalllog_insert ON "AgentCallLog";
DROP POLICY IF EXISTS agentcalllog_update ON "AgentCallLog";
DROP POLICY IF EXISTS agentcalllog_delete ON "AgentCallLog";

CREATE POLICY agentcalllog_select ON "AgentCallLog"
  FOR SELECT TO app_user
  USING (
    "callerAgentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY agentcalllog_insert ON "AgentCallLog"
  FOR INSERT TO app_user
  WITH CHECK (
    "callerAgentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY agentcalllog_update ON "AgentCallLog"
  FOR UPDATE TO app_user
  USING (
    "callerAgentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  )
  WITH CHECK (
    "callerAgentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY agentcalllog_delete ON "AgentCallLog"
  FOR DELETE TO app_user
  USING (
    "callerAgentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

-- =========================================================================
-- Performance note
-- =========================================================================
-- The subquery is re-evaluated per row. If the parent table is large and the
-- FK column isn't indexed, expect 10-100x slowdown. Ensure:
--   1. Index on "AgentCallLog"."callerAgentId" (declared in this template)
--   2. Composite index on "Agent"("organizationId", "id")
--      (declared in the parent's TENANT_DIRECT migration)

-- =========================================================================
-- Rollback
-- =========================================================================
-- DROP POLICY IF EXISTS agentcalllog_select ON "AgentCallLog";
-- DROP POLICY IF EXISTS agentcalllog_insert ON "AgentCallLog";
-- DROP POLICY IF EXISTS agentcalllog_update ON "AgentCallLog";
-- DROP POLICY IF EXISTS agentcalllog_delete ON "AgentCallLog";
-- ALTER TABLE "AgentCallLog" DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Model: AgentMemory (via agentId → Agent.organizationId)
-- =============================================================================
-- =========================================================================
-- TENANT_INDIRECT policy template (cascaded via FK)
-- =========================================================================
-- Use for tables that don't have organizationId directly but reach it via
-- a foreign key chain (typically agentId → Agent.organizationId).
--
-- Placeholders:
--   AgentMemory      — PascalCase model name (e.g., "Flow")
--   agentmemory     — lowercase form (e.g., "flow")
--   agentId       — FK column name (e.g., "agentId")
--   Agent    — Parent table name (e.g., "Agent")
--   organizationId — Parent's tenant column (e.g., "organizationId")

-- 1. Index on FK column (often already exists via @relation)
CREATE INDEX IF NOT EXISTS "AgentMemory_agentId_id_idx"
  ON "AgentMemory" ("agentId", "id");

-- 2. Enable RLS
ALTER TABLE "AgentMemory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentMemory" FORCE ROW LEVEL SECURITY;

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentMemory" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentMemory" TO admin_user;

-- 4. Policies — subquery against parent
-- Idempotent: drop existing same-named policies first so this migration is
-- safe to re-run and safe on partially-migrated tables.
DROP POLICY IF EXISTS agentmemory_select ON "AgentMemory";
DROP POLICY IF EXISTS agentmemory_insert ON "AgentMemory";
DROP POLICY IF EXISTS agentmemory_update ON "AgentMemory";
DROP POLICY IF EXISTS agentmemory_delete ON "AgentMemory";

CREATE POLICY agentmemory_select ON "AgentMemory"
  FOR SELECT TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY agentmemory_insert ON "AgentMemory"
  FOR INSERT TO app_user
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY agentmemory_update ON "AgentMemory"
  FOR UPDATE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  )
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY agentmemory_delete ON "AgentMemory"
  FOR DELETE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

-- =========================================================================
-- Performance note
-- =========================================================================
-- The subquery is re-evaluated per row. If the parent table is large and the
-- FK column isn't indexed, expect 10-100x slowdown. Ensure:
--   1. Index on "AgentMemory"."agentId" (declared in this template)
--   2. Composite index on "Agent"("organizationId", "id")
--      (declared in the parent's TENANT_DIRECT migration)

-- =========================================================================
-- Rollback
-- =========================================================================
-- DROP POLICY IF EXISTS agentmemory_select ON "AgentMemory";
-- DROP POLICY IF EXISTS agentmemory_insert ON "AgentMemory";
-- DROP POLICY IF EXISTS agentmemory_update ON "AgentMemory";
-- DROP POLICY IF EXISTS agentmemory_delete ON "AgentMemory";
-- ALTER TABLE "AgentMemory" DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Model: FlowSchedule (via agentId → Agent.organizationId)
-- =============================================================================
-- =========================================================================
-- TENANT_INDIRECT policy template (cascaded via FK)
-- =========================================================================
-- Use for tables that don't have organizationId directly but reach it via
-- a foreign key chain (typically agentId → Agent.organizationId).
--
-- Placeholders:
--   FlowSchedule      — PascalCase model name (e.g., "Flow")
--   flowschedule     — lowercase form (e.g., "flow")
--   agentId       — FK column name (e.g., "agentId")
--   Agent    — Parent table name (e.g., "Agent")
--   organizationId — Parent's tenant column (e.g., "organizationId")

-- 1. Index on FK column (often already exists via @relation)
CREATE INDEX IF NOT EXISTS "FlowSchedule_agentId_id_idx"
  ON "FlowSchedule" ("agentId", "id");

-- 2. Enable RLS
ALTER TABLE "FlowSchedule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FlowSchedule" FORCE ROW LEVEL SECURITY;

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "FlowSchedule" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "FlowSchedule" TO admin_user;

-- 4. Policies — subquery against parent
-- Idempotent: drop existing same-named policies first so this migration is
-- safe to re-run and safe on partially-migrated tables.
DROP POLICY IF EXISTS flowschedule_select ON "FlowSchedule";
DROP POLICY IF EXISTS flowschedule_insert ON "FlowSchedule";
DROP POLICY IF EXISTS flowschedule_update ON "FlowSchedule";
DROP POLICY IF EXISTS flowschedule_delete ON "FlowSchedule";

CREATE POLICY flowschedule_select ON "FlowSchedule"
  FOR SELECT TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY flowschedule_insert ON "FlowSchedule"
  FOR INSERT TO app_user
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY flowschedule_update ON "FlowSchedule"
  FOR UPDATE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  )
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY flowschedule_delete ON "FlowSchedule"
  FOR DELETE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

-- =========================================================================
-- Performance note
-- =========================================================================
-- The subquery is re-evaluated per row. If the parent table is large and the
-- FK column isn't indexed, expect 10-100x slowdown. Ensure:
--   1. Index on "FlowSchedule"."agentId" (declared in this template)
--   2. Composite index on "Agent"("organizationId", "id")
--      (declared in the parent's TENANT_DIRECT migration)

-- =========================================================================
-- Rollback
-- =========================================================================
-- DROP POLICY IF EXISTS flowschedule_select ON "FlowSchedule";
-- DROP POLICY IF EXISTS flowschedule_insert ON "FlowSchedule";
-- DROP POLICY IF EXISTS flowschedule_update ON "FlowSchedule";
-- DROP POLICY IF EXISTS flowschedule_delete ON "FlowSchedule";
-- ALTER TABLE "FlowSchedule" DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Model: AgentExecution (via agentId → Agent.organizationId)
-- =============================================================================
-- =========================================================================
-- TENANT_INDIRECT policy template (cascaded via FK)
-- =========================================================================
-- Use for tables that don't have organizationId directly but reach it via
-- a foreign key chain (typically agentId → Agent.organizationId).
--
-- Placeholders:
--   AgentExecution      — PascalCase model name (e.g., "Flow")
--   agentexecution     — lowercase form (e.g., "flow")
--   agentId       — FK column name (e.g., "agentId")
--   Agent    — Parent table name (e.g., "Agent")
--   organizationId — Parent's tenant column (e.g., "organizationId")

-- 1. Index on FK column (often already exists via @relation)
CREATE INDEX IF NOT EXISTS "AgentExecution_agentId_id_idx"
  ON "AgentExecution" ("agentId", "id");

-- 2. Enable RLS
ALTER TABLE "AgentExecution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentExecution" FORCE ROW LEVEL SECURITY;

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentExecution" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentExecution" TO admin_user;

-- 4. Policies — subquery against parent
-- Idempotent: drop existing same-named policies first so this migration is
-- safe to re-run and safe on partially-migrated tables.
DROP POLICY IF EXISTS agentexecution_select ON "AgentExecution";
DROP POLICY IF EXISTS agentexecution_insert ON "AgentExecution";
DROP POLICY IF EXISTS agentexecution_update ON "AgentExecution";
DROP POLICY IF EXISTS agentexecution_delete ON "AgentExecution";

CREATE POLICY agentexecution_select ON "AgentExecution"
  FOR SELECT TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY agentexecution_insert ON "AgentExecution"
  FOR INSERT TO app_user
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY agentexecution_update ON "AgentExecution"
  FOR UPDATE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  )
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY agentexecution_delete ON "AgentExecution"
  FOR DELETE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

-- =========================================================================
-- Performance note
-- =========================================================================
-- The subquery is re-evaluated per row. If the parent table is large and the
-- FK column isn't indexed, expect 10-100x slowdown. Ensure:
--   1. Index on "AgentExecution"."agentId" (declared in this template)
--   2. Composite index on "Agent"("organizationId", "id")
--      (declared in the parent's TENANT_DIRECT migration)

-- =========================================================================
-- Rollback
-- =========================================================================
-- DROP POLICY IF EXISTS agentexecution_select ON "AgentExecution";
-- DROP POLICY IF EXISTS agentexecution_insert ON "AgentExecution";
-- DROP POLICY IF EXISTS agentexecution_update ON "AgentExecution";
-- DROP POLICY IF EXISTS agentexecution_delete ON "AgentExecution";
-- ALTER TABLE "AgentExecution" DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Model: Instinct (via agentId → Agent.organizationId)
-- =============================================================================
-- =========================================================================
-- TENANT_INDIRECT policy template (cascaded via FK)
-- =========================================================================
-- Use for tables that don't have organizationId directly but reach it via
-- a foreign key chain (typically agentId → Agent.organizationId).
--
-- Placeholders:
--   Instinct      — PascalCase model name (e.g., "Flow")
--   instinct     — lowercase form (e.g., "flow")
--   agentId       — FK column name (e.g., "agentId")
--   Agent    — Parent table name (e.g., "Agent")
--   organizationId — Parent's tenant column (e.g., "organizationId")

-- 1. Index on FK column (often already exists via @relation)
CREATE INDEX IF NOT EXISTS "Instinct_agentId_id_idx"
  ON "Instinct" ("agentId", "id");

-- 2. Enable RLS
ALTER TABLE "Instinct" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Instinct" FORCE ROW LEVEL SECURITY;

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "Instinct" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Instinct" TO admin_user;

-- 4. Policies — subquery against parent
-- Idempotent: drop existing same-named policies first so this migration is
-- safe to re-run and safe on partially-migrated tables.
DROP POLICY IF EXISTS instinct_select ON "Instinct";
DROP POLICY IF EXISTS instinct_insert ON "Instinct";
DROP POLICY IF EXISTS instinct_update ON "Instinct";
DROP POLICY IF EXISTS instinct_delete ON "Instinct";

CREATE POLICY instinct_select ON "Instinct"
  FOR SELECT TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY instinct_insert ON "Instinct"
  FOR INSERT TO app_user
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY instinct_update ON "Instinct"
  FOR UPDATE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  )
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY instinct_delete ON "Instinct"
  FOR DELETE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

-- =========================================================================
-- Performance note
-- =========================================================================
-- The subquery is re-evaluated per row. If the parent table is large and the
-- FK column isn't indexed, expect 10-100x slowdown. Ensure:
--   1. Index on "Instinct"."agentId" (declared in this template)
--   2. Composite index on "Agent"("organizationId", "id")
--      (declared in the parent's TENANT_DIRECT migration)

-- =========================================================================
-- Rollback
-- =========================================================================
-- DROP POLICY IF EXISTS instinct_select ON "Instinct";
-- DROP POLICY IF EXISTS instinct_insert ON "Instinct";
-- DROP POLICY IF EXISTS instinct_update ON "Instinct";
-- DROP POLICY IF EXISTS instinct_delete ON "Instinct";
-- ALTER TABLE "Instinct" DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Model: FlowTrace (via agentId → Agent.organizationId)
-- =============================================================================
-- =========================================================================
-- TENANT_INDIRECT policy template (cascaded via FK)
-- =========================================================================
-- Use for tables that don't have organizationId directly but reach it via
-- a foreign key chain (typically agentId → Agent.organizationId).
--
-- Placeholders:
--   FlowTrace      — PascalCase model name (e.g., "Flow")
--   flowtrace     — lowercase form (e.g., "flow")
--   agentId       — FK column name (e.g., "agentId")
--   Agent    — Parent table name (e.g., "Agent")
--   organizationId — Parent's tenant column (e.g., "organizationId")

-- 1. Index on FK column (often already exists via @relation)
CREATE INDEX IF NOT EXISTS "FlowTrace_agentId_id_idx"
  ON "FlowTrace" ("agentId", "id");

-- 2. Enable RLS
ALTER TABLE "FlowTrace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FlowTrace" FORCE ROW LEVEL SECURITY;

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "FlowTrace" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "FlowTrace" TO admin_user;

-- 4. Policies — subquery against parent
-- Idempotent: drop existing same-named policies first so this migration is
-- safe to re-run and safe on partially-migrated tables.
DROP POLICY IF EXISTS flowtrace_select ON "FlowTrace";
DROP POLICY IF EXISTS flowtrace_insert ON "FlowTrace";
DROP POLICY IF EXISTS flowtrace_update ON "FlowTrace";
DROP POLICY IF EXISTS flowtrace_delete ON "FlowTrace";

CREATE POLICY flowtrace_select ON "FlowTrace"
  FOR SELECT TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY flowtrace_insert ON "FlowTrace"
  FOR INSERT TO app_user
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY flowtrace_update ON "FlowTrace"
  FOR UPDATE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  )
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY flowtrace_delete ON "FlowTrace"
  FOR DELETE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

-- =========================================================================
-- Performance note
-- =========================================================================
-- The subquery is re-evaluated per row. If the parent table is large and the
-- FK column isn't indexed, expect 10-100x slowdown. Ensure:
--   1. Index on "FlowTrace"."agentId" (declared in this template)
--   2. Composite index on "Agent"("organizationId", "id")
--      (declared in the parent's TENANT_DIRECT migration)

-- =========================================================================
-- Rollback
-- =========================================================================
-- DROP POLICY IF EXISTS flowtrace_select ON "FlowTrace";
-- DROP POLICY IF EXISTS flowtrace_insert ON "FlowTrace";
-- DROP POLICY IF EXISTS flowtrace_update ON "FlowTrace";
-- DROP POLICY IF EXISTS flowtrace_delete ON "FlowTrace";
-- ALTER TABLE "FlowTrace" DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Model: AgentGoalLink (via agentId → Agent.organizationId)
-- =============================================================================
-- =========================================================================
-- TENANT_INDIRECT policy template (cascaded via FK)
-- =========================================================================
-- Use for tables that don't have organizationId directly but reach it via
-- a foreign key chain (typically agentId → Agent.organizationId).
--
-- Placeholders:
--   AgentGoalLink      — PascalCase model name (e.g., "Flow")
--   agentgoallink     — lowercase form (e.g., "flow")
--   agentId       — FK column name (e.g., "agentId")
--   Agent    — Parent table name (e.g., "Agent")
--   organizationId — Parent's tenant column (e.g., "organizationId")

-- 1. Index on FK column (often already exists via @relation)
CREATE INDEX IF NOT EXISTS "AgentGoalLink_agentId_id_idx"
  ON "AgentGoalLink" ("agentId", "id");

-- 2. Enable RLS
ALTER TABLE "AgentGoalLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentGoalLink" FORCE ROW LEVEL SECURITY;

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentGoalLink" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentGoalLink" TO admin_user;

-- 4. Policies — subquery against parent
-- Idempotent: drop existing same-named policies first so this migration is
-- safe to re-run and safe on partially-migrated tables.
DROP POLICY IF EXISTS agentgoallink_select ON "AgentGoalLink";
DROP POLICY IF EXISTS agentgoallink_insert ON "AgentGoalLink";
DROP POLICY IF EXISTS agentgoallink_update ON "AgentGoalLink";
DROP POLICY IF EXISTS agentgoallink_delete ON "AgentGoalLink";

CREATE POLICY agentgoallink_select ON "AgentGoalLink"
  FOR SELECT TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY agentgoallink_insert ON "AgentGoalLink"
  FOR INSERT TO app_user
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY agentgoallink_update ON "AgentGoalLink"
  FOR UPDATE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  )
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY agentgoallink_delete ON "AgentGoalLink"
  FOR DELETE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

-- =========================================================================
-- Performance note
-- =========================================================================
-- The subquery is re-evaluated per row. If the parent table is large and the
-- FK column isn't indexed, expect 10-100x slowdown. Ensure:
--   1. Index on "AgentGoalLink"."agentId" (declared in this template)
--   2. Composite index on "Agent"("organizationId", "id")
--      (declared in the parent's TENANT_DIRECT migration)

-- =========================================================================
-- Rollback
-- =========================================================================
-- DROP POLICY IF EXISTS agentgoallink_select ON "AgentGoalLink";
-- DROP POLICY IF EXISTS agentgoallink_insert ON "AgentGoalLink";
-- DROP POLICY IF EXISTS agentgoallink_update ON "AgentGoalLink";
-- DROP POLICY IF EXISTS agentgoallink_delete ON "AgentGoalLink";
-- ALTER TABLE "AgentGoalLink" DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Model: AgentBudget (via agentId → Agent.organizationId)
-- =============================================================================
-- =========================================================================
-- TENANT_INDIRECT policy template (cascaded via FK)
-- =========================================================================
-- Use for tables that don't have organizationId directly but reach it via
-- a foreign key chain (typically agentId → Agent.organizationId).
--
-- Placeholders:
--   AgentBudget      — PascalCase model name (e.g., "Flow")
--   agentbudget     — lowercase form (e.g., "flow")
--   agentId       — FK column name (e.g., "agentId")
--   Agent    — Parent table name (e.g., "Agent")
--   organizationId — Parent's tenant column (e.g., "organizationId")

-- 1. Index on FK column (often already exists via @relation)
CREATE INDEX IF NOT EXISTS "AgentBudget_agentId_id_idx"
  ON "AgentBudget" ("agentId", "id");

-- 2. Enable RLS
ALTER TABLE "AgentBudget" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentBudget" FORCE ROW LEVEL SECURITY;

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentBudget" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentBudget" TO admin_user;

-- 4. Policies — subquery against parent
-- Idempotent: drop existing same-named policies first so this migration is
-- safe to re-run and safe on partially-migrated tables.
DROP POLICY IF EXISTS agentbudget_select ON "AgentBudget";
DROP POLICY IF EXISTS agentbudget_insert ON "AgentBudget";
DROP POLICY IF EXISTS agentbudget_update ON "AgentBudget";
DROP POLICY IF EXISTS agentbudget_delete ON "AgentBudget";

CREATE POLICY agentbudget_select ON "AgentBudget"
  FOR SELECT TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY agentbudget_insert ON "AgentBudget"
  FOR INSERT TO app_user
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY agentbudget_update ON "AgentBudget"
  FOR UPDATE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  )
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY agentbudget_delete ON "AgentBudget"
  FOR DELETE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

-- =========================================================================
-- Performance note
-- =========================================================================
-- The subquery is re-evaluated per row. If the parent table is large and the
-- FK column isn't indexed, expect 10-100x slowdown. Ensure:
--   1. Index on "AgentBudget"."agentId" (declared in this template)
--   2. Composite index on "Agent"("organizationId", "id")
--      (declared in the parent's TENANT_DIRECT migration)

-- =========================================================================
-- Rollback
-- =========================================================================
-- DROP POLICY IF EXISTS agentbudget_select ON "AgentBudget";
-- DROP POLICY IF EXISTS agentbudget_insert ON "AgentBudget";
-- DROP POLICY IF EXISTS agentbudget_update ON "AgentBudget";
-- DROP POLICY IF EXISTS agentbudget_delete ON "AgentBudget";
-- ALTER TABLE "AgentBudget" DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Model: CostEvent (via agentId → Agent.organizationId)
-- =============================================================================
-- =========================================================================
-- TENANT_INDIRECT policy template (cascaded via FK)
-- =========================================================================
-- Use for tables that don't have organizationId directly but reach it via
-- a foreign key chain (typically agentId → Agent.organizationId).
--
-- Placeholders:
--   CostEvent      — PascalCase model name (e.g., "Flow")
--   costevent     — lowercase form (e.g., "flow")
--   agentId       — FK column name (e.g., "agentId")
--   Agent    — Parent table name (e.g., "Agent")
--   organizationId — Parent's tenant column (e.g., "organizationId")

-- 1. Index on FK column (often already exists via @relation)
CREATE INDEX IF NOT EXISTS "CostEvent_agentId_id_idx"
  ON "CostEvent" ("agentId", "id");

-- 2. Enable RLS
ALTER TABLE "CostEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CostEvent" FORCE ROW LEVEL SECURITY;

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "CostEvent" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "CostEvent" TO admin_user;

-- 4. Policies — subquery against parent
-- Idempotent: drop existing same-named policies first so this migration is
-- safe to re-run and safe on partially-migrated tables.
DROP POLICY IF EXISTS costevent_select ON "CostEvent";
DROP POLICY IF EXISTS costevent_insert ON "CostEvent";
DROP POLICY IF EXISTS costevent_update ON "CostEvent";
DROP POLICY IF EXISTS costevent_delete ON "CostEvent";

CREATE POLICY costevent_select ON "CostEvent"
  FOR SELECT TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY costevent_insert ON "CostEvent"
  FOR INSERT TO app_user
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY costevent_update ON "CostEvent"
  FOR UPDATE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  )
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY costevent_delete ON "CostEvent"
  FOR DELETE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

-- =========================================================================
-- Performance note
-- =========================================================================
-- The subquery is re-evaluated per row. If the parent table is large and the
-- FK column isn't indexed, expect 10-100x slowdown. Ensure:
--   1. Index on "CostEvent"."agentId" (declared in this template)
--   2. Composite index on "Agent"("organizationId", "id")
--      (declared in the parent's TENANT_DIRECT migration)

-- =========================================================================
-- Rollback
-- =========================================================================
-- DROP POLICY IF EXISTS costevent_select ON "CostEvent";
-- DROP POLICY IF EXISTS costevent_insert ON "CostEvent";
-- DROP POLICY IF EXISTS costevent_update ON "CostEvent";
-- DROP POLICY IF EXISTS costevent_delete ON "CostEvent";
-- ALTER TABLE "CostEvent" DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Model: BudgetAlert (via agentId → Agent.organizationId)
-- =============================================================================
-- =========================================================================
-- TENANT_INDIRECT policy template (cascaded via FK)
-- =========================================================================
-- Use for tables that don't have organizationId directly but reach it via
-- a foreign key chain (typically agentId → Agent.organizationId).
--
-- Placeholders:
--   BudgetAlert      — PascalCase model name (e.g., "Flow")
--   budgetalert     — lowercase form (e.g., "flow")
--   agentId       — FK column name (e.g., "agentId")
--   Agent    — Parent table name (e.g., "Agent")
--   organizationId — Parent's tenant column (e.g., "organizationId")

-- 1. Index on FK column (often already exists via @relation)
CREATE INDEX IF NOT EXISTS "BudgetAlert_agentId_id_idx"
  ON "BudgetAlert" ("agentId", "id");

-- 2. Enable RLS
ALTER TABLE "BudgetAlert" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BudgetAlert" FORCE ROW LEVEL SECURITY;

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "BudgetAlert" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "BudgetAlert" TO admin_user;

-- 4. Policies — subquery against parent
-- Idempotent: drop existing same-named policies first so this migration is
-- safe to re-run and safe on partially-migrated tables.
DROP POLICY IF EXISTS budgetalert_select ON "BudgetAlert";
DROP POLICY IF EXISTS budgetalert_insert ON "BudgetAlert";
DROP POLICY IF EXISTS budgetalert_update ON "BudgetAlert";
DROP POLICY IF EXISTS budgetalert_delete ON "BudgetAlert";

CREATE POLICY budgetalert_select ON "BudgetAlert"
  FOR SELECT TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY budgetalert_insert ON "BudgetAlert"
  FOR INSERT TO app_user
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY budgetalert_update ON "BudgetAlert"
  FOR UPDATE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  )
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY budgetalert_delete ON "BudgetAlert"
  FOR DELETE TO app_user
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );

-- =========================================================================
-- Performance note
-- =========================================================================
-- The subquery is re-evaluated per row. If the parent table is large and the
-- FK column isn't indexed, expect 10-100x slowdown. Ensure:
--   1. Index on "BudgetAlert"."agentId" (declared in this template)
--   2. Composite index on "Agent"("organizationId", "id")
--      (declared in the parent's TENANT_DIRECT migration)

-- =========================================================================
-- Rollback
-- =========================================================================
-- DROP POLICY IF EXISTS budgetalert_select ON "BudgetAlert";
-- DROP POLICY IF EXISTS budgetalert_insert ON "BudgetAlert";
-- DROP POLICY IF EXISTS budgetalert_update ON "BudgetAlert";
-- DROP POLICY IF EXISTS budgetalert_delete ON "BudgetAlert";
-- ALTER TABLE "BudgetAlert" DISABLE ROW LEVEL SECURITY;



-- #############################################################################
-- PART B — 8 multi-hop tables (hand-authored, see phase2-multihop-policies.sql)
-- #############################################################################

-- =============================================================================
-- Phase 2 (TENANT_INDIRECT) — hand-authored multi-hop RLS policies
-- =============================================================================
-- The 8 models below reach Agent.organizationId through 2–3 FK hops, which the
-- single-hop generator template cannot express. Each policy is a nested IN
-- subquery that bottoms out at Agent.organizationId, scoped to the current org
-- via current_setting('app.current_org_id', true).
--
-- FK columns verified against prisma/schema.prisma on 2026-06-21.
--
-- CORRECTION vs step1-inventory.ts tenantPath: WebhookExecution is anchored on
-- webhookConfigId (NOT NULL), NOT the inferred conversationId (which is
-- nullable — a NULL anchor would hide legitimate rows and is the wrong owner).
--
-- Notes:
--   * Idempotent (DROP POLICY IF EXISTS before CREATE) — safe to re-run.
--   * admin_user has BYPASSRLS, so these policies do not constrain it.
--   * Intermediate parents (KnowledgeBase, Conversation, Flow, FlowSchedule,
--     WebhookConfig, EvalSuite) carry their own RLS; the subqueries still
--     resolve correctly (same-org filtering compounds, never widens). All FK
--     anchors are indexed, and Agent(organizationId, id) exists (Phase 1), so
--     the subqueries stay index-backed.
--   * Apply to STAGING first, then run STEP 4 verify-staging before prod.
-- =============================================================================


-- =============================================================================
-- KBSource — knowledgeBaseId → KnowledgeBase.agentId → Agent.organizationId
-- =============================================================================
CREATE INDEX IF NOT EXISTS "KBSource_knowledgeBaseId_id_idx"
  ON "KBSource" ("knowledgeBaseId", "id");

ALTER TABLE "KBSource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KBSource" FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON "KBSource" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "KBSource" TO admin_user;

DROP POLICY IF EXISTS kbsource_select ON "KBSource";
DROP POLICY IF EXISTS kbsource_insert ON "KBSource";
DROP POLICY IF EXISTS kbsource_update ON "KBSource";
DROP POLICY IF EXISTS kbsource_delete ON "KBSource";

CREATE POLICY kbsource_select ON "KBSource"
  FOR SELECT TO app_user
  USING (
    "knowledgeBaseId" IN (
      SELECT id FROM "KnowledgeBase" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY kbsource_insert ON "KBSource"
  FOR INSERT TO app_user
  WITH CHECK (
    "knowledgeBaseId" IN (
      SELECT id FROM "KnowledgeBase" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY kbsource_update ON "KBSource"
  FOR UPDATE TO app_user
  USING (
    "knowledgeBaseId" IN (
      SELECT id FROM "KnowledgeBase" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  )
  WITH CHECK (
    "knowledgeBaseId" IN (
      SELECT id FROM "KnowledgeBase" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY kbsource_delete ON "KBSource"
  FOR DELETE TO app_user
  USING (
    "knowledgeBaseId" IN (
      SELECT id FROM "KnowledgeBase" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );


-- =============================================================================
-- KBChunk — sourceId → KBSource.knowledgeBaseId → KnowledgeBase.agentId → Agent.org
-- =============================================================================
CREATE INDEX IF NOT EXISTS "KBChunk_sourceId_id_idx"
  ON "KBChunk" ("sourceId", "id");

ALTER TABLE "KBChunk" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KBChunk" FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON "KBChunk" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "KBChunk" TO admin_user;

DROP POLICY IF EXISTS kbchunk_select ON "KBChunk";
DROP POLICY IF EXISTS kbchunk_insert ON "KBChunk";
DROP POLICY IF EXISTS kbchunk_update ON "KBChunk";
DROP POLICY IF EXISTS kbchunk_delete ON "KBChunk";

CREATE POLICY kbchunk_select ON "KBChunk"
  FOR SELECT TO app_user
  USING (
    "sourceId" IN (
      SELECT id FROM "KBSource" WHERE "knowledgeBaseId" IN (
        SELECT id FROM "KnowledgeBase" WHERE "agentId" IN (
          SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
        )
      )
    )
  );

CREATE POLICY kbchunk_insert ON "KBChunk"
  FOR INSERT TO app_user
  WITH CHECK (
    "sourceId" IN (
      SELECT id FROM "KBSource" WHERE "knowledgeBaseId" IN (
        SELECT id FROM "KnowledgeBase" WHERE "agentId" IN (
          SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
        )
      )
    )
  );

CREATE POLICY kbchunk_update ON "KBChunk"
  FOR UPDATE TO app_user
  USING (
    "sourceId" IN (
      SELECT id FROM "KBSource" WHERE "knowledgeBaseId" IN (
        SELECT id FROM "KnowledgeBase" WHERE "agentId" IN (
          SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
        )
      )
    )
  )
  WITH CHECK (
    "sourceId" IN (
      SELECT id FROM "KBSource" WHERE "knowledgeBaseId" IN (
        SELECT id FROM "KnowledgeBase" WHERE "agentId" IN (
          SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
        )
      )
    )
  );

CREATE POLICY kbchunk_delete ON "KBChunk"
  FOR DELETE TO app_user
  USING (
    "sourceId" IN (
      SELECT id FROM "KBSource" WHERE "knowledgeBaseId" IN (
        SELECT id FROM "KnowledgeBase" WHERE "agentId" IN (
          SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
        )
      )
    )
  );


-- =============================================================================
-- Message — conversationId → Conversation.agentId → Agent.organizationId
-- =============================================================================
CREATE INDEX IF NOT EXISTS "Message_conversationId_id_idx"
  ON "Message" ("conversationId", "id");

ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message" FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON "Message" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Message" TO admin_user;

DROP POLICY IF EXISTS message_select ON "Message";
DROP POLICY IF EXISTS message_insert ON "Message";
DROP POLICY IF EXISTS message_update ON "Message";
DROP POLICY IF EXISTS message_delete ON "Message";

CREATE POLICY message_select ON "Message"
  FOR SELECT TO app_user
  USING (
    "conversationId" IN (
      SELECT id FROM "Conversation" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY message_insert ON "Message"
  FOR INSERT TO app_user
  WITH CHECK (
    "conversationId" IN (
      SELECT id FROM "Conversation" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY message_update ON "Message"
  FOR UPDATE TO app_user
  USING (
    "conversationId" IN (
      SELECT id FROM "Conversation" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  )
  WITH CHECK (
    "conversationId" IN (
      SELECT id FROM "Conversation" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY message_delete ON "Message"
  FOR DELETE TO app_user
  USING (
    "conversationId" IN (
      SELECT id FROM "Conversation" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );


-- =============================================================================
-- FlowVersion — flowId → Flow.agentId → Agent.organizationId
-- =============================================================================
CREATE INDEX IF NOT EXISTS "FlowVersion_flowId_id_idx"
  ON "FlowVersion" ("flowId", "id");

ALTER TABLE "FlowVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FlowVersion" FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON "FlowVersion" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "FlowVersion" TO admin_user;

DROP POLICY IF EXISTS flowversion_select ON "FlowVersion";
DROP POLICY IF EXISTS flowversion_insert ON "FlowVersion";
DROP POLICY IF EXISTS flowversion_update ON "FlowVersion";
DROP POLICY IF EXISTS flowversion_delete ON "FlowVersion";

CREATE POLICY flowversion_select ON "FlowVersion"
  FOR SELECT TO app_user
  USING (
    "flowId" IN (
      SELECT id FROM "Flow" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY flowversion_insert ON "FlowVersion"
  FOR INSERT TO app_user
  WITH CHECK (
    "flowId" IN (
      SELECT id FROM "Flow" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY flowversion_update ON "FlowVersion"
  FOR UPDATE TO app_user
  USING (
    "flowId" IN (
      SELECT id FROM "Flow" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  )
  WITH CHECK (
    "flowId" IN (
      SELECT id FROM "Flow" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY flowversion_delete ON "FlowVersion"
  FOR DELETE TO app_user
  USING (
    "flowId" IN (
      SELECT id FROM "Flow" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );


-- =============================================================================
-- ScheduledExecution — flowScheduleId → FlowSchedule.agentId → Agent.org
-- =============================================================================
CREATE INDEX IF NOT EXISTS "ScheduledExecution_flowScheduleId_id_idx"
  ON "ScheduledExecution" ("flowScheduleId", "id");

ALTER TABLE "ScheduledExecution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScheduledExecution" FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON "ScheduledExecution" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ScheduledExecution" TO admin_user;

DROP POLICY IF EXISTS scheduledexecution_select ON "ScheduledExecution";
DROP POLICY IF EXISTS scheduledexecution_insert ON "ScheduledExecution";
DROP POLICY IF EXISTS scheduledexecution_update ON "ScheduledExecution";
DROP POLICY IF EXISTS scheduledexecution_delete ON "ScheduledExecution";

CREATE POLICY scheduledexecution_select ON "ScheduledExecution"
  FOR SELECT TO app_user
  USING (
    "flowScheduleId" IN (
      SELECT id FROM "FlowSchedule" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY scheduledexecution_insert ON "ScheduledExecution"
  FOR INSERT TO app_user
  WITH CHECK (
    "flowScheduleId" IN (
      SELECT id FROM "FlowSchedule" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY scheduledexecution_update ON "ScheduledExecution"
  FOR UPDATE TO app_user
  USING (
    "flowScheduleId" IN (
      SELECT id FROM "FlowSchedule" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  )
  WITH CHECK (
    "flowScheduleId" IN (
      SELECT id FROM "FlowSchedule" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY scheduledexecution_delete ON "ScheduledExecution"
  FOR DELETE TO app_user
  USING (
    "flowScheduleId" IN (
      SELECT id FROM "FlowSchedule" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );


-- =============================================================================
-- WebhookExecution — webhookConfigId → WebhookConfig.agentId → Agent.org
-- (Anchored on webhookConfigId, NOT the nullable conversationId.)
-- =============================================================================
CREATE INDEX IF NOT EXISTS "WebhookExecution_webhookConfigId_id_idx"
  ON "WebhookExecution" ("webhookConfigId", "id");

ALTER TABLE "WebhookExecution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebhookExecution" FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON "WebhookExecution" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "WebhookExecution" TO admin_user;

DROP POLICY IF EXISTS webhookexecution_select ON "WebhookExecution";
DROP POLICY IF EXISTS webhookexecution_insert ON "WebhookExecution";
DROP POLICY IF EXISTS webhookexecution_update ON "WebhookExecution";
DROP POLICY IF EXISTS webhookexecution_delete ON "WebhookExecution";

CREATE POLICY webhookexecution_select ON "WebhookExecution"
  FOR SELECT TO app_user
  USING (
    "webhookConfigId" IN (
      SELECT id FROM "WebhookConfig" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY webhookexecution_insert ON "WebhookExecution"
  FOR INSERT TO app_user
  WITH CHECK (
    "webhookConfigId" IN (
      SELECT id FROM "WebhookConfig" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY webhookexecution_update ON "WebhookExecution"
  FOR UPDATE TO app_user
  USING (
    "webhookConfigId" IN (
      SELECT id FROM "WebhookConfig" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  )
  WITH CHECK (
    "webhookConfigId" IN (
      SELECT id FROM "WebhookConfig" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY webhookexecution_delete ON "WebhookExecution"
  FOR DELETE TO app_user
  USING (
    "webhookConfigId" IN (
      SELECT id FROM "WebhookConfig" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );


-- =============================================================================
-- WebhookDeadLetter — webhookConfigId → WebhookConfig.agentId → Agent.org
-- =============================================================================
CREATE INDEX IF NOT EXISTS "WebhookDeadLetter_webhookConfigId_id_idx"
  ON "WebhookDeadLetter" ("webhookConfigId", "id");

ALTER TABLE "WebhookDeadLetter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebhookDeadLetter" FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON "WebhookDeadLetter" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "WebhookDeadLetter" TO admin_user;

DROP POLICY IF EXISTS webhookdeadletter_select ON "WebhookDeadLetter";
DROP POLICY IF EXISTS webhookdeadletter_insert ON "WebhookDeadLetter";
DROP POLICY IF EXISTS webhookdeadletter_update ON "WebhookDeadLetter";
DROP POLICY IF EXISTS webhookdeadletter_delete ON "WebhookDeadLetter";

CREATE POLICY webhookdeadletter_select ON "WebhookDeadLetter"
  FOR SELECT TO app_user
  USING (
    "webhookConfigId" IN (
      SELECT id FROM "WebhookConfig" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY webhookdeadletter_insert ON "WebhookDeadLetter"
  FOR INSERT TO app_user
  WITH CHECK (
    "webhookConfigId" IN (
      SELECT id FROM "WebhookConfig" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY webhookdeadletter_update ON "WebhookDeadLetter"
  FOR UPDATE TO app_user
  USING (
    "webhookConfigId" IN (
      SELECT id FROM "WebhookConfig" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  )
  WITH CHECK (
    "webhookConfigId" IN (
      SELECT id FROM "WebhookConfig" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY webhookdeadletter_delete ON "WebhookDeadLetter"
  FOR DELETE TO app_user
  USING (
    "webhookConfigId" IN (
      SELECT id FROM "WebhookConfig" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );


-- =============================================================================
-- EvalTestCase — suiteId → EvalSuite.agentId → Agent.organizationId
-- =============================================================================
CREATE INDEX IF NOT EXISTS "EvalTestCase_suiteId_id_idx"
  ON "EvalTestCase" ("suiteId", "id");

ALTER TABLE "EvalTestCase" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EvalTestCase" FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON "EvalTestCase" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "EvalTestCase" TO admin_user;

DROP POLICY IF EXISTS evaltestcase_select ON "EvalTestCase";
DROP POLICY IF EXISTS evaltestcase_insert ON "EvalTestCase";
DROP POLICY IF EXISTS evaltestcase_update ON "EvalTestCase";
DROP POLICY IF EXISTS evaltestcase_delete ON "EvalTestCase";

CREATE POLICY evaltestcase_select ON "EvalTestCase"
  FOR SELECT TO app_user
  USING (
    "suiteId" IN (
      SELECT id FROM "EvalSuite" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY evaltestcase_insert ON "EvalTestCase"
  FOR INSERT TO app_user
  WITH CHECK (
    "suiteId" IN (
      SELECT id FROM "EvalSuite" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY evaltestcase_update ON "EvalTestCase"
  FOR UPDATE TO app_user
  USING (
    "suiteId" IN (
      SELECT id FROM "EvalSuite" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  )
  WITH CHECK (
    "suiteId" IN (
      SELECT id FROM "EvalSuite" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY evaltestcase_delete ON "EvalTestCase"
  FOR DELETE TO app_user
  USING (
    "suiteId" IN (
      SELECT id FROM "EvalSuite" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );


-- =============================================================================
-- Rollback (uncomment to revert all 8)
-- =============================================================================
-- DO $$ DECLARE t text; BEGIN
--   FOREACH t IN ARRAY ARRAY['KBSource','KBChunk','Message','FlowVersion',
--     'ScheduledExecution','WebhookExecution','WebhookDeadLetter','EvalTestCase']
--   LOOP
--     EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', t);
--   END LOOP;
-- END $$;
