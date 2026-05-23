-- Phase 1 Migration #1: OrganizationMember RLS (TENANT_DIRECT)
-- Apply order: #1 of 14 — foundational membership table, low write rate
-- Runbook: docs/rls-phase-1-cutover-runbook.md §2.3
-- Template: skills/rls-rollout/templates/tenant-direct.sql.template

-- 1. Composite index for RLS performance
CREATE INDEX IF NOT EXISTS "OrganizationMember_organizationId_id_idx"
  ON "OrganizationMember" ("organizationId", "id");

-- 2. Enable RLS
ALTER TABLE "OrganizationMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrganizationMember" FORCE ROW LEVEL SECURITY;

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "OrganizationMember" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "OrganizationMember" TO admin_user;

-- 4. Policies (admin_user has BYPASSRLS — no policies needed for it)
CREATE POLICY organizationmember_select ON "OrganizationMember"
  FOR SELECT TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY organizationmember_insert ON "OrganizationMember"
  FOR INSERT TO app_user
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY organizationmember_update ON "OrganizationMember"
  FOR UPDATE TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY organizationmember_delete ON "OrganizationMember"
  FOR DELETE TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true));

-- =========================================================================
-- Rollback (commented — uncomment to revert)
-- =========================================================================
-- DROP POLICY IF EXISTS organizationmember_select ON "OrganizationMember";
-- DROP POLICY IF EXISTS organizationmember_insert ON "OrganizationMember";
-- DROP POLICY IF EXISTS organizationmember_update ON "OrganizationMember";
-- DROP POLICY IF EXISTS organizationmember_delete ON "OrganizationMember";
-- ALTER TABLE "OrganizationMember" DISABLE ROW LEVEL SECURITY;
-- DROP INDEX IF EXISTS "OrganizationMember_organizationId_id_idx";
