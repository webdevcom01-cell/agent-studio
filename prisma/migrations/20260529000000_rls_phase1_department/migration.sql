-- Phase 1 Migration #4: Department RLS (TENANT_DIRECT)
-- Apply order: #4 of 14 — org-chart hierarchy table; has parentId self-ref (same org only)
-- Runbook: docs/rls-phase-1-cutover-runbook.md §2.3
-- Template: skills/rls-rollout/templates/tenant-direct.sql.template

-- 1. Composite index for RLS performance
CREATE INDEX IF NOT EXISTS "Department_organizationId_id_idx"
  ON "Department" ("organizationId", "id");

-- 2. Enable RLS
ALTER TABLE "Department" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Department" FORCE ROW LEVEL SECURITY;

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "Department" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Department" TO admin_user;

-- 4. Policies (admin_user has BYPASSRLS — no policies needed for it)
CREATE POLICY department_select ON "Department"
  FOR SELECT TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY department_insert ON "Department"
  FOR INSERT TO app_user
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY department_update ON "Department"
  FOR UPDATE TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY department_delete ON "Department"
  FOR DELETE TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true));

-- =========================================================================
-- Rollback (commented — uncomment to revert)
-- =========================================================================
-- DROP POLICY IF EXISTS department_select ON "Department";
-- DROP POLICY IF EXISTS department_insert ON "Department";
-- DROP POLICY IF EXISTS department_update ON "Department";
-- DROP POLICY IF EXISTS department_delete ON "Department";
-- ALTER TABLE "Department" DISABLE ROW LEVEL SECURITY;
-- DROP INDEX IF EXISTS "Department_organizationId_id_idx";
