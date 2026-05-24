-- RLS Phase 1 #9 — HeartbeatRun (TENANT_DIRECT)
-- One row per heartbeat job: created RUNNING, updated to COMPLETED/FAILED.
-- Worker uses explicit organizationId from job.data (ALS empty in workers).

-- 1. Composite index for RLS performance (CRITICAL)
CREATE INDEX IF NOT EXISTS "HeartbeatRun_organizationId_id_idx"
  ON "HeartbeatRun" ("organizationId", "id");

-- 2. Enable RLS with FORCE (so table owner also obeys policies)
ALTER TABLE "HeartbeatRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HeartbeatRun" FORCE ROW LEVEL SECURITY;

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "HeartbeatRun" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "HeartbeatRun" TO admin_user;

-- 4. Policies (admin_user has BYPASSRLS — no policies needed for it)
CREATE POLICY heartbeatrun_select ON "HeartbeatRun"
  FOR SELECT TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY heartbeatrun_insert ON "HeartbeatRun"
  FOR INSERT TO app_user
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY heartbeatrun_update ON "HeartbeatRun"
  FOR UPDATE TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY heartbeatrun_delete ON "HeartbeatRun"
  FOR DELETE TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true));

-- =========================================================================
-- Rollback (uncomment to revert)
-- =========================================================================
-- DROP POLICY IF EXISTS heartbeatrun_select ON "HeartbeatRun";
-- DROP POLICY IF EXISTS heartbeatrun_insert ON "HeartbeatRun";
-- DROP POLICY IF EXISTS heartbeatrun_update ON "HeartbeatRun";
-- DROP POLICY IF EXISTS heartbeatrun_delete ON "HeartbeatRun";
-- ALTER TABLE "HeartbeatRun" DISABLE ROW LEVEL SECURITY;
-- DROP INDEX IF EXISTS "HeartbeatRun_organizationId_id_idx";
