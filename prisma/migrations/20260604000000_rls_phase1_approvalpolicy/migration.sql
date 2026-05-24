-- RLS Phase 1 #10 — ApprovalPolicy (TENANT_DIRECT)
-- Board governance table. Admin/cron ops (processTimeouts) rely on
-- DATABASE_URL BYPASSRLS and do NOT use withOrgContext.

-- 1. Composite index for RLS performance (CRITICAL)
CREATE INDEX IF NOT EXISTS "ApprovalPolicy_organizationId_id_idx"
  ON "ApprovalPolicy" ("organizationId", "id");

-- 2. Enable RLS with FORCE (so table owner also obeys policies)
ALTER TABLE "ApprovalPolicy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApprovalPolicy" FORCE ROW LEVEL SECURITY;

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "ApprovalPolicy" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ApprovalPolicy" TO admin_user;

-- 4. Policies (admin_user has BYPASSRLS — no policies needed for it)
CREATE POLICY approvalpolicy_select ON "ApprovalPolicy"
  FOR SELECT TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY approvalpolicy_insert ON "ApprovalPolicy"
  FOR INSERT TO app_user
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY approvalpolicy_update ON "ApprovalPolicy"
  FOR UPDATE TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY approvalpolicy_delete ON "ApprovalPolicy"
  FOR DELETE TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true));

-- =========================================================================
-- Rollback (uncomment to revert)
-- =========================================================================
-- DROP POLICY IF EXISTS approvalpolicy_select ON "ApprovalPolicy";
-- DROP POLICY IF EXISTS approvalpolicy_insert ON "ApprovalPolicy";
-- DROP POLICY IF EXISTS approvalpolicy_update ON "ApprovalPolicy";
-- DROP POLICY IF EXISTS approvalpolicy_delete ON "ApprovalPolicy";
-- ALTER TABLE "ApprovalPolicy" DISABLE ROW LEVEL SECURITY;
-- DROP INDEX IF EXISTS "ApprovalPolicy_organizationId_id_idx";
