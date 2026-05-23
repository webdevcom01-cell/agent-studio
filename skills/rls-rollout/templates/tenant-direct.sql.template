-- =========================================================================
-- TENANT_DIRECT policy template
-- =========================================================================
-- Placeholders:
--   {{TABLE_NAME}}    — PascalCase Prisma model name (e.g., "CompanyMission")
--   {{table_lower}}   — lowercase snake (e.g., "companymission")
--
-- Use this template for tables that have an `organizationId` column directly.
-- For tables with `isPublic` flag (marketplace), use policy-tenant-direct-with-public.sql.tpl instead.

-- 1. Composite index for RLS performance (CRITICAL)
CREATE INDEX IF NOT EXISTS "{{TABLE_NAME}}_organizationId_id_idx"
  ON "{{TABLE_NAME}}" ("organizationId", "id");

-- 2. Enable RLS with FORCE (so table owner also obeys policies)
ALTER TABLE "{{TABLE_NAME}}" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "{{TABLE_NAME}}" FORCE ROW LEVEL SECURITY;

-- 3. Grants (postgres remains owner; app_user is restricted by policies)
GRANT SELECT, INSERT, UPDATE, DELETE ON "{{TABLE_NAME}}" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "{{TABLE_NAME}}" TO admin_user;

-- 4. Policies (admin_user has BYPASSRLS so does not need these)
CREATE POLICY {{table_lower}}_select ON "{{TABLE_NAME}}"
  FOR SELECT TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY {{table_lower}}_insert ON "{{TABLE_NAME}}"
  FOR INSERT TO app_user
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY {{table_lower}}_update ON "{{TABLE_NAME}}"
  FOR UPDATE TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY {{table_lower}}_delete ON "{{TABLE_NAME}}"
  FOR DELETE TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true));

-- =========================================================================
-- Rollback (commented — uncomment to revert)
-- =========================================================================
-- DROP POLICY IF EXISTS {{table_lower}}_select ON "{{TABLE_NAME}}";
-- DROP POLICY IF EXISTS {{table_lower}}_insert ON "{{TABLE_NAME}}";
-- DROP POLICY IF EXISTS {{table_lower}}_update ON "{{TABLE_NAME}}";
-- DROP POLICY IF EXISTS {{table_lower}}_delete ON "{{TABLE_NAME}}";
-- ALTER TABLE "{{TABLE_NAME}}" DISABLE ROW LEVEL SECURITY;
-- DROP INDEX IF EXISTS "{{TABLE_NAME}}_organizationId_id_idx";
