-- Phase 1 (late addition): Template RLS (TENANT_DIRECT, isPublic marketplace table)
--
-- Template was listed as TENANT_DIRECT #13 in docs/rls-phase-1-cutover-runbook.md,
-- but its policy migration was never created. Found during the Phase 2 dry-run
-- coverage audit (a tenant table with organizationId but no RLS = no DB backstop;
-- under enforcement private templates would have no row-level protection).
--
-- Template is org-scoped (requireOrgMember + organizationId in app routes; all
-- code paths already go through withOrgContext / withAdminBypass). isPublic rows
-- are shared cross-org for the marketplace, so the SELECT policy ORs in isPublic.
-- Write policies stay strict — public read does NOT grant write.

-- 1. Composite index for RLS performance (no-op if it already exists)
CREATE INDEX IF NOT EXISTS "Template_organizationId_id_idx"
  ON "Template" ("organizationId", "id");

-- 2. Enable RLS
ALTER TABLE "Template" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Template" FORCE ROW LEVEL SECURITY;

-- 3. Grants (admin_user has BYPASSRLS — policies below only bind app_user)
GRANT SELECT, INSERT, UPDATE, DELETE ON "Template" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Template" TO admin_user;

-- 4. Policies
CREATE POLICY template_select ON "Template"
  FOR SELECT TO app_user
  USING (
    "organizationId" = current_setting('app.current_org_id', true)
    OR "isPublic" = true
  );

CREATE POLICY template_insert ON "Template"
  FOR INSERT TO app_user
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY template_update ON "Template"
  FOR UPDATE TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY template_delete ON "Template"
  FOR DELETE TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true));

-- =========================================================================
-- Rollback (commented — uncomment to revert)
-- =========================================================================
-- DROP POLICY IF EXISTS template_select ON "Template";
-- DROP POLICY IF EXISTS template_insert ON "Template";
-- DROP POLICY IF EXISTS template_update ON "Template";
-- DROP POLICY IF EXISTS template_delete ON "Template";
-- ALTER TABLE "Template" DISABLE ROW LEVEL SECURITY;
-- DROP INDEX IF EXISTS "Template_organizationId_id_idx";
