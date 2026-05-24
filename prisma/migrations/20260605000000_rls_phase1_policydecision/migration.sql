-- Phase 1 #11 — PolicyDecision RLS
-- FK to ApprovalPolicy; applied immediately after Migration #10.
-- processTimeouts cross-org cron relies on DATABASE_URL BYPASSRLS (see tech-debt #6).

CREATE INDEX IF NOT EXISTS "PolicyDecision_organizationId_id_idx"
  ON "PolicyDecision" ("organizationId", "id");

ALTER TABLE "PolicyDecision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PolicyDecision" FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON "PolicyDecision" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PolicyDecision" TO admin_user;

CREATE POLICY "pd_select" ON "PolicyDecision"
  FOR SELECT TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY "pd_insert" ON "PolicyDecision"
  FOR INSERT TO app_user
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY "pd_update" ON "PolicyDecision"
  FOR UPDATE TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY "pd_delete" ON "PolicyDecision"
  FOR DELETE TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true));
