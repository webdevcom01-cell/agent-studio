-- Phase 1 Migration #3: CompanyMission RLS (TENANT_DIRECT)
-- Apply order: #3 of 14 — internal config table; 1:1 with org
-- Runbook: docs/rls-phase-1-cutover-runbook.md §2.3
-- Template: skills/rls-rollout/templates/tenant-direct.sql.template

-- 1. Composite index for RLS performance
CREATE INDEX IF NOT EXISTS "CompanyMission_organizationId_id_idx"
  ON "CompanyMission" ("organizationId", "id");

-- 2. Enable RLS
ALTER TABLE "CompanyMission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CompanyMission" FORCE ROW LEVEL SECURITY;

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "CompanyMission" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "CompanyMission" TO admin_user;

-- 4. Policies (admin_user has BYPASSRLS — no policies needed for it)
CREATE POLICY companymission_select ON "CompanyMission"
  FOR SELECT TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY companymission_insert ON "CompanyMission"
  FOR INSERT TO app_user
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY companymission_update ON "CompanyMission"
  FOR UPDATE TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY companymission_delete ON "CompanyMission"
  FOR DELETE TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true));

-- =========================================================================
-- Rollback (commented — uncomment to revert)
-- =========================================================================
-- DROP POLICY IF EXISTS companymission_select ON "CompanyMission";
-- DROP POLICY IF EXISTS companymission_insert ON "CompanyMission";
-- DROP POLICY IF EXISTS companymission_update ON "CompanyMission";
-- DROP POLICY IF EXISTS companymission_delete ON "CompanyMission";
-- ALTER TABLE "CompanyMission" DISABLE ROW LEVEL SECURITY;
-- DROP INDEX IF EXISTS "CompanyMission_organizationId_id_idx";
