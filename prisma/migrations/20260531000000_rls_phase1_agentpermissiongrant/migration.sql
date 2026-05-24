-- RLS Phase 1 #6 — AgentPermissionGrant (TENANT_DIRECT)
-- Security-sensitive: governs A2A permission delegation between agents.

-- 1. Composite index for RLS performance (CRITICAL)
CREATE INDEX IF NOT EXISTS "AgentPermissionGrant_organizationId_id_idx"
  ON "AgentPermissionGrant" ("organizationId", "id");

-- 2. Enable RLS with FORCE (so table owner also obeys policies)
ALTER TABLE "AgentPermissionGrant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentPermissionGrant" FORCE ROW LEVEL SECURITY;

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentPermissionGrant" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentPermissionGrant" TO admin_user;

-- 4. Policies (admin_user has BYPASSRLS — no policies needed for it)
CREATE POLICY agentpermissiongrant_select ON "AgentPermissionGrant"
  FOR SELECT TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY agentpermissiongrant_insert ON "AgentPermissionGrant"
  FOR INSERT TO app_user
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY agentpermissiongrant_update ON "AgentPermissionGrant"
  FOR UPDATE TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY agentpermissiongrant_delete ON "AgentPermissionGrant"
  FOR DELETE TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true));

-- =========================================================================
-- Rollback (uncomment to revert)
-- =========================================================================
-- DROP POLICY IF EXISTS agentpermissiongrant_select ON "AgentPermissionGrant";
-- DROP POLICY IF EXISTS agentpermissiongrant_insert ON "AgentPermissionGrant";
-- DROP POLICY IF EXISTS agentpermissiongrant_update ON "AgentPermissionGrant";
-- DROP POLICY IF EXISTS agentpermissiongrant_delete ON "AgentPermissionGrant";
-- ALTER TABLE "AgentPermissionGrant" DISABLE ROW LEVEL SECURITY;
-- DROP INDEX IF EXISTS "AgentPermissionGrant_organizationId_id_idx";
