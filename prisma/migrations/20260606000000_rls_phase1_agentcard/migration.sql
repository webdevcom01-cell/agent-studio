-- Phase 1 #12 — AgentCard RLS
-- AgentCard has no organizationId column; policies use an EXISTS subquery
-- against Agent (agentId is UNIQUE so the subquery is a single-row PK lookup).
-- isPublic=true rows are readable cross-org (A2A discovery pattern).
-- upsertAgentCard is a fire-and-forget write that relies on DATABASE_URL BYPASSRLS.

ALTER TABLE "AgentCard" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentCard" FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentCard" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentCard" TO admin_user;

-- Own-org cards + cross-org public cards
CREATE POLICY "ac_select" ON "AgentCard"
  FOR SELECT TO app_user
  USING (
    "isPublic" = true
    OR EXISTS (
      SELECT 1 FROM "Agent" a
      WHERE a.id = "AgentCard"."agentId"
        AND a."organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY "ac_insert" ON "AgentCard"
  FOR INSERT TO app_user
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Agent" a
      WHERE a.id = "AgentCard"."agentId"
        AND a."organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY "ac_update" ON "AgentCard"
  FOR UPDATE TO app_user
  USING (
    EXISTS (
      SELECT 1 FROM "Agent" a
      WHERE a.id = "AgentCard"."agentId"
        AND a."organizationId" = current_setting('app.current_org_id', true)
    )
  );

CREATE POLICY "ac_delete" ON "AgentCard"
  FOR DELETE TO app_user
  USING (
    EXISTS (
      SELECT 1 FROM "Agent" a
      WHERE a.id = "AgentCard"."agentId"
        AND a."organizationId" = current_setting('app.current_org_id', true)
    )
  );
