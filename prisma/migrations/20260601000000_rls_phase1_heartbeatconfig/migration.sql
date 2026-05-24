-- RLS Phase 1 #7 — HeartbeatConfig (TENANT_DIRECT)
-- BullMQ worker reads this via organizationId from job.data; ALS is empty in workers.

-- 1. Composite index for RLS performance (CRITICAL)
CREATE INDEX IF NOT EXISTS "HeartbeatConfig_organizationId_id_idx"
  ON "HeartbeatConfig" ("organizationId", "id");

-- 2. Enable RLS with FORCE (so table owner also obeys policies)
ALTER TABLE "HeartbeatConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HeartbeatConfig" FORCE ROW LEVEL SECURITY;

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "HeartbeatConfig" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "HeartbeatConfig" TO admin_user;

-- 4. Policies (admin_user has BYPASSRLS — no policies needed for it)
CREATE POLICY heartbeatconfig_select ON "HeartbeatConfig"
  FOR SELECT TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY heartbeatconfig_insert ON "HeartbeatConfig"
  FOR INSERT TO app_user
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY heartbeatconfig_update ON "HeartbeatConfig"
  FOR UPDATE TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY heartbeatconfig_delete ON "HeartbeatConfig"
  FOR DELETE TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true));

-- =========================================================================
-- Rollback (uncomment to revert)
-- =========================================================================
-- DROP POLICY IF EXISTS heartbeatconfig_select ON "HeartbeatConfig";
-- DROP POLICY IF EXISTS heartbeatconfig_insert ON "HeartbeatConfig";
-- DROP POLICY IF EXISTS heartbeatconfig_update ON "HeartbeatConfig";
-- DROP POLICY IF EXISTS heartbeatconfig_delete ON "HeartbeatConfig";
-- ALTER TABLE "HeartbeatConfig" DISABLE ROW LEVEL SECURITY;
-- DROP INDEX IF EXISTS "HeartbeatConfig_organizationId_id_idx";
