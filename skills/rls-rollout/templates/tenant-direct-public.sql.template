-- =========================================================================
-- TENANT_DIRECT with `isPublic` flag policy template
-- =========================================================================
-- Use for: Agent, Template, AgentCard (marketplace cross-tenant reads)
--
-- Behavior:
--   SELECT  — visible to own org OR if isPublic=true (cross-org reads allowed)
--   INSERT  — only into own org
--   UPDATE  — only own org rows (own org owners can flip isPublic)
--   DELETE  — only own org rows
--
-- Placeholders:
--   {{TABLE_NAME}}    — PascalCase model name
--   {{table_lower}}   — lowercase form

-- 1. Composite index (with isPublic for marketplace queries)
CREATE INDEX IF NOT EXISTS "{{TABLE_NAME}}_organizationId_id_idx"
  ON "{{TABLE_NAME}}" ("organizationId", "id");

CREATE INDEX IF NOT EXISTS "{{TABLE_NAME}}_isPublic_updatedAt_idx"
  ON "{{TABLE_NAME}}" ("isPublic", "updatedAt" DESC)
  WHERE "isPublic" = true;

-- 2. Enable RLS
ALTER TABLE "{{TABLE_NAME}}" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "{{TABLE_NAME}}" FORCE ROW LEVEL SECURITY;

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "{{TABLE_NAME}}" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "{{TABLE_NAME}}" TO admin_user;

-- 4. Policies
-- SELECT — own org OR public
CREATE POLICY {{table_lower}}_select ON "{{TABLE_NAME}}"
  FOR SELECT TO app_user
  USING (
    "organizationId" = current_setting('app.current_org_id', true)
    OR "isPublic" = true
  );

-- INSERT — only into own org
CREATE POLICY {{table_lower}}_insert ON "{{TABLE_NAME}}"
  FOR INSERT TO app_user
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

-- UPDATE — only own org rows (can flip isPublic for own row)
CREATE POLICY {{table_lower}}_update ON "{{TABLE_NAME}}"
  FOR UPDATE TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

-- DELETE — only own org rows
CREATE POLICY {{table_lower}}_delete ON "{{TABLE_NAME}}"
  FOR DELETE TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true));

-- =========================================================================
-- Rollback
-- =========================================================================
-- DROP POLICY IF EXISTS {{table_lower}}_select ON "{{TABLE_NAME}}";
-- DROP POLICY IF EXISTS {{table_lower}}_insert ON "{{TABLE_NAME}}";
-- DROP POLICY IF EXISTS {{table_lower}}_update ON "{{TABLE_NAME}}";
-- DROP POLICY IF EXISTS {{table_lower}}_delete ON "{{TABLE_NAME}}";
-- ALTER TABLE "{{TABLE_NAME}}" DISABLE ROW LEVEL SECURITY;
-- DROP INDEX IF EXISTS "{{TABLE_NAME}}_isPublic_updatedAt_idx";
-- DROP INDEX IF EXISTS "{{TABLE_NAME}}_organizationId_id_idx";
