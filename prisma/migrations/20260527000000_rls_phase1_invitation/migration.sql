-- Phase 1 Migration #2: Invitation RLS (TENANT_DIRECT)
-- Apply order: #2 of 14 — low traffic; isolated create/consume lifecycle
-- Runbook: docs/rls-phase-1-cutover-runbook.md §2.3
-- Template: skills/rls-rollout/templates/tenant-direct.sql.template

-- 1. Composite index for RLS performance
CREATE INDEX IF NOT EXISTS "Invitation_organizationId_id_idx"
  ON "Invitation" ("organizationId", "id");

-- 2. Enable RLS
ALTER TABLE "Invitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invitation" FORCE ROW LEVEL SECURITY;

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "Invitation" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Invitation" TO admin_user;

-- 4. Policies (admin_user has BYPASSRLS — no policies needed for it)
CREATE POLICY invitation_select ON "Invitation"
  FOR SELECT TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY invitation_insert ON "Invitation"
  FOR INSERT TO app_user
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY invitation_update ON "Invitation"
  FOR UPDATE TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY invitation_delete ON "Invitation"
  FOR DELETE TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true));

-- =========================================================================
-- Rollback (commented — uncomment to revert)
-- =========================================================================
-- DROP POLICY IF EXISTS invitation_select ON "Invitation";
-- DROP POLICY IF EXISTS invitation_insert ON "Invitation";
-- DROP POLICY IF EXISTS invitation_update ON "Invitation";
-- DROP POLICY IF EXISTS invitation_delete ON "Invitation";
-- ALTER TABLE "Invitation" DISABLE ROW LEVEL SECURITY;
-- DROP INDEX IF EXISTS "Invitation_organizationId_id_idx";
