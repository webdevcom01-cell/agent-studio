-- Phase 1 Migration #5: Goal RLS (TENANT_DIRECT)
-- Apply order: #5 of 14 — goals hierarchy; missionId FK → CompanyMission (already RLS-enforced)
-- Runbook: docs/rls-phase-1-cutover-runbook.md §2.3
-- Template: skills/rls-rollout/templates/tenant-direct.sql.template

-- 1. Composite index for RLS performance
--    Note: @@index([organizationId, status]) already exists as Goal_organizationId_status_idx;
--    this adds the (organizationId, id) index required by the standard RLS policy template.
CREATE INDEX IF NOT EXISTS "Goal_organizationId_id_idx"
  ON "Goal" ("organizationId", "id");

-- 2. Enable RLS
ALTER TABLE "Goal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Goal" FORCE ROW LEVEL SECURITY;

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "Goal" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Goal" TO admin_user;

-- 4. Policies (admin_user has BYPASSRLS — no policies needed for it)
CREATE POLICY goal_select ON "Goal"
  FOR SELECT TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY goal_insert ON "Goal"
  FOR INSERT TO app_user
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY goal_update ON "Goal"
  FOR UPDATE TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY goal_delete ON "Goal"
  FOR DELETE TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true));

-- =========================================================================
-- Rollback (commented — uncomment to revert)
-- =========================================================================
-- DROP POLICY IF EXISTS goal_select ON "Goal";
-- DROP POLICY IF EXISTS goal_insert ON "Goal";
-- DROP POLICY IF EXISTS goal_update ON "Goal";
-- DROP POLICY IF EXISTS goal_delete ON "Goal";
-- ALTER TABLE "Goal" DISABLE ROW LEVEL SECURITY;
-- DROP INDEX IF EXISTS "Goal_organizationId_id_idx";
