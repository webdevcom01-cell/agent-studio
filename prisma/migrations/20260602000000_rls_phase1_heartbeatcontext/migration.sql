-- RLS Phase 1 #8 — HeartbeatContext (TENANT_DIRECT)
-- High insert rate: BullMQ worker upserts per heartbeat cycle.
-- Worker uses explicit organizationId from job.data (ALS empty in workers).

-- 1. Composite index for RLS performance (CRITICAL — high-frequency table)
CREATE INDEX IF NOT EXISTS "HeartbeatContext_organizationId_id_idx"
  ON "HeartbeatContext" ("organizationId", "id");

-- 2. Enable RLS with FORCE (so table owner also obeys policies)
ALTER TABLE "HeartbeatContext" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HeartbeatContext" FORCE ROW LEVEL SECURITY;

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "HeartbeatContext" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "HeartbeatContext" TO admin_user;

-- 4. Policies (admin_user has BYPASSRLS — no policies needed for it)
CREATE POLICY heartbeatcontext_select ON "HeartbeatContext"
  FOR SELECT TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY heartbeatcontext_insert ON "HeartbeatContext"
  FOR INSERT TO app_user
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY heartbeatcontext_update ON "HeartbeatContext"
  FOR UPDATE TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY heartbeatcontext_delete ON "HeartbeatContext"
  FOR DELETE TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true));

-- =========================================================================
-- Rollback (uncomment to revert)
-- =========================================================================
-- DROP POLICY IF EXISTS heartbeatcontext_select ON "HeartbeatContext";
-- DROP POLICY IF EXISTS heartbeatcontext_insert ON "HeartbeatContext";
-- DROP POLICY IF EXISTS heartbeatcontext_update ON "HeartbeatContext";
-- DROP POLICY IF EXISTS heartbeatcontext_delete ON "HeartbeatContext";
-- ALTER TABLE "HeartbeatContext" DISABLE ROW LEVEL SECURITY;
-- DROP INDEX IF EXISTS "HeartbeatContext_organizationId_id_idx";
