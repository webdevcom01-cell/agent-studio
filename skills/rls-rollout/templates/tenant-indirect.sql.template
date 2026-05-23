-- =========================================================================
-- TENANT_INDIRECT policy template (cascaded via FK)
-- =========================================================================
-- Use for tables that don't have organizationId directly but reach it via
-- a foreign key chain (typically agentId → Agent.organizationId).
--
-- Placeholders:
--   {{TABLE_NAME}}      — PascalCase model name (e.g., "Flow")
--   {{table_lower}}     — lowercase form (e.g., "flow")
--   {{FK_COLUMN}}       — FK column name (e.g., "agentId")
--   {{PARENT_TABLE}}    — Parent table name (e.g., "Agent")
--   {{PARENT_TENANT_COL}} — Parent's tenant column (e.g., "organizationId")

-- 1. Index on FK column (often already exists via @relation)
CREATE INDEX IF NOT EXISTS "{{TABLE_NAME}}_{{FK_COLUMN}}_id_idx"
  ON "{{TABLE_NAME}}" ("{{FK_COLUMN}}", "id");

-- 2. Enable RLS
ALTER TABLE "{{TABLE_NAME}}" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "{{TABLE_NAME}}" FORCE ROW LEVEL SECURITY;

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "{{TABLE_NAME}}" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "{{TABLE_NAME}}" TO admin_user;

-- 4. Policies — subquery against parent
CREATE POLICY {{table_lower}}_select ON "{{TABLE_NAME}}"
  FOR SELECT TO app_user
  USING (
    "{{FK_COLUMN}}" IN (
      SELECT id FROM "{{PARENT_TABLE}}"
      WHERE "{{PARENT_TENANT_COL}}" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY {{table_lower}}_insert ON "{{TABLE_NAME}}"
  FOR INSERT TO app_user
  WITH CHECK (
    "{{FK_COLUMN}}" IN (
      SELECT id FROM "{{PARENT_TABLE}}"
      WHERE "{{PARENT_TENANT_COL}}" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY {{table_lower}}_update ON "{{TABLE_NAME}}"
  FOR UPDATE TO app_user
  USING (
    "{{FK_COLUMN}}" IN (
      SELECT id FROM "{{PARENT_TABLE}}"
      WHERE "{{PARENT_TENANT_COL}}" = current_setting('app.current_org_id', true)
    )
  )
  WITH CHECK (
    "{{FK_COLUMN}}" IN (
      SELECT id FROM "{{PARENT_TABLE}}"
      WHERE "{{PARENT_TENANT_COL}}" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY {{table_lower}}_delete ON "{{TABLE_NAME}}"
  FOR DELETE TO app_user
  USING (
    "{{FK_COLUMN}}" IN (
      SELECT id FROM "{{PARENT_TABLE}}"
      WHERE "{{PARENT_TENANT_COL}}" = current_setting('app.current_org_id', true)
    )
  );

-- =========================================================================
-- Performance note
-- =========================================================================
-- The subquery is re-evaluated per row. If the parent table is large and the
-- FK column isn't indexed, expect 10-100x slowdown. Ensure:
--   1. Index on "{{TABLE_NAME}}"."{{FK_COLUMN}}" (declared in this template)
--   2. Composite index on "{{PARENT_TABLE}}"("{{PARENT_TENANT_COL}}", "id")
--      (declared in the parent's TENANT_DIRECT migration)

-- =========================================================================
-- Rollback
-- =========================================================================
-- DROP POLICY IF EXISTS {{table_lower}}_select ON "{{TABLE_NAME}}";
-- DROP POLICY IF EXISTS {{table_lower}}_insert ON "{{TABLE_NAME}}";
-- DROP POLICY IF EXISTS {{table_lower}}_update ON "{{TABLE_NAME}}";
-- DROP POLICY IF EXISTS {{table_lower}}_delete ON "{{TABLE_NAME}}";
-- ALTER TABLE "{{TABLE_NAME}}" DISABLE ROW LEVEL SECURITY;
