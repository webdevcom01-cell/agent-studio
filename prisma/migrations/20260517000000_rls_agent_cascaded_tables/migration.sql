-- ============================================================================
-- RLS for agent-cascaded tables (B2)
--
-- These tables are isolated via their agentId FK → Agent.organizationId.
-- No schema change is needed — policies JOIN through the existing FK.
--
-- Tables covered:
--   ✅ Flow               — agentId (direct FK)
--   ✅ KnowledgeBase      — agentId (direct FK)
--   ✅ WebhookConfig      — agentId (direct FK)
--   ✅ EvalSuite          — agentId (direct FK)
--   ✅ AgentSkillPermission — agentId (direct FK)
--   ✅ EvalRun            — suiteId → EvalSuite → agentId
--   ✅ EvalResult         — runId → EvalRun → EvalSuite → agentId
--
-- Tables NOT covered here (require schema changes or are admin-only):
--   ⏳ ApiKey, MCPServer  — user-scoped, isolated by API auth, no agentId
--   ⏳ AuditLog           — admin-only; BYPASSRLS on admin DB role suffices
--
-- When `app.current_org_id` is unset (''), admin role BYPASSRLS takes over.
-- ============================================================================

-- ── Shared macro: allowed agentId set ────────────────────────────────────────
-- Reused by all direct-agentId tables. Mirrors the Agent SELECT policy exactly.

-- ── Flow ─────────────────────────────────────────────────────────────────────
ALTER TABLE "Flow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Flow" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Flow" OWNER TO postgres;

CREATE POLICY "flow_tenant_select" ON "Flow"
  FOR SELECT
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
         OR ("organizationId" IS NULL AND current_setting('app.current_org_id', true) IS DISTINCT FROM '')
    )
  );

CREATE POLICY "flow_tenant_insert" ON "Flow"
  FOR INSERT
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
         OR ("organizationId" IS NULL AND current_setting('app.current_org_id', true) IS DISTINCT FROM '')
    )
  );

CREATE POLICY "flow_tenant_update" ON "Flow"
  FOR UPDATE
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
         OR ("organizationId" IS NULL AND current_setting('app.current_org_id', true) IS DISTINCT FROM '')
    )
  );

CREATE POLICY "flow_tenant_delete" ON "Flow"
  FOR DELETE
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
         OR ("organizationId" IS NULL AND current_setting('app.current_org_id', true) IS DISTINCT FROM '')
    )
  );

-- ── KnowledgeBase ─────────────────────────────────────────────────────────────
ALTER TABLE "KnowledgeBase" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KnowledgeBase" FORCE ROW LEVEL SECURITY;
ALTER TABLE "KnowledgeBase" OWNER TO postgres;

CREATE POLICY "kb_tenant_select" ON "KnowledgeBase"
  FOR SELECT
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
         OR ("organizationId" IS NULL AND current_setting('app.current_org_id', true) IS DISTINCT FROM '')
    )
  );

CREATE POLICY "kb_tenant_insert" ON "KnowledgeBase"
  FOR INSERT
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
         OR ("organizationId" IS NULL AND current_setting('app.current_org_id', true) IS DISTINCT FROM '')
    )
  );

CREATE POLICY "kb_tenant_update" ON "KnowledgeBase"
  FOR UPDATE
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
         OR ("organizationId" IS NULL AND current_setting('app.current_org_id', true) IS DISTINCT FROM '')
    )
  );

CREATE POLICY "kb_tenant_delete" ON "KnowledgeBase"
  FOR DELETE
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
         OR ("organizationId" IS NULL AND current_setting('app.current_org_id', true) IS DISTINCT FROM '')
    )
  );

-- ── WebhookConfig ─────────────────────────────────────────────────────────────
ALTER TABLE "WebhookConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebhookConfig" FORCE ROW LEVEL SECURITY;
ALTER TABLE "WebhookConfig" OWNER TO postgres;

CREATE POLICY "webhook_tenant_select" ON "WebhookConfig"
  FOR SELECT
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
         OR ("organizationId" IS NULL AND current_setting('app.current_org_id', true) IS DISTINCT FROM '')
    )
  );

CREATE POLICY "webhook_tenant_insert" ON "WebhookConfig"
  FOR INSERT
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
         OR ("organizationId" IS NULL AND current_setting('app.current_org_id', true) IS DISTINCT FROM '')
    )
  );

CREATE POLICY "webhook_tenant_update" ON "WebhookConfig"
  FOR UPDATE
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
         OR ("organizationId" IS NULL AND current_setting('app.current_org_id', true) IS DISTINCT FROM '')
    )
  );

CREATE POLICY "webhook_tenant_delete" ON "WebhookConfig"
  FOR DELETE
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
         OR ("organizationId" IS NULL AND current_setting('app.current_org_id', true) IS DISTINCT FROM '')
    )
  );

-- ── EvalSuite ──────────────────────────────────────────────────────────────────
ALTER TABLE "EvalSuite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EvalSuite" FORCE ROW LEVEL SECURITY;
ALTER TABLE "EvalSuite" OWNER TO postgres;

CREATE POLICY "eval_suite_tenant_select" ON "EvalSuite"
  FOR SELECT
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
         OR ("organizationId" IS NULL AND current_setting('app.current_org_id', true) IS DISTINCT FROM '')
    )
  );

CREATE POLICY "eval_suite_tenant_insert" ON "EvalSuite"
  FOR INSERT
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
         OR ("organizationId" IS NULL AND current_setting('app.current_org_id', true) IS DISTINCT FROM '')
    )
  );

CREATE POLICY "eval_suite_tenant_update" ON "EvalSuite"
  FOR UPDATE
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
         OR ("organizationId" IS NULL AND current_setting('app.current_org_id', true) IS DISTINCT FROM '')
    )
  );

CREATE POLICY "eval_suite_tenant_delete" ON "EvalSuite"
  FOR DELETE
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
         OR ("organizationId" IS NULL AND current_setting('app.current_org_id', true) IS DISTINCT FROM '')
    )
  );

-- ── AgentSkillPermission ───────────────────────────────────────────────────────
ALTER TABLE "AgentSkillPermission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentSkillPermission" FORCE ROW LEVEL SECURITY;
ALTER TABLE "AgentSkillPermission" OWNER TO postgres;

CREATE POLICY "asp_tenant_select" ON "AgentSkillPermission"
  FOR SELECT
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
         OR ("organizationId" IS NULL AND current_setting('app.current_org_id', true) IS DISTINCT FROM '')
    )
  );

CREATE POLICY "asp_tenant_insert" ON "AgentSkillPermission"
  FOR INSERT
  WITH CHECK (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
         OR ("organizationId" IS NULL AND current_setting('app.current_org_id', true) IS DISTINCT FROM '')
    )
  );

CREATE POLICY "asp_tenant_update" ON "AgentSkillPermission"
  FOR UPDATE
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
         OR ("organizationId" IS NULL AND current_setting('app.current_org_id', true) IS DISTINCT FROM '')
    )
  );

CREATE POLICY "asp_tenant_delete" ON "AgentSkillPermission"
  FOR DELETE
  USING (
    "agentId" IN (
      SELECT id FROM "Agent"
      WHERE "organizationId" = current_setting('app.current_org_id', true)
         OR ("organizationId" IS NULL AND current_setting('app.current_org_id', true) IS DISTINCT FROM '')
    )
  );

-- ── EvalRun (chain: suiteId → EvalSuite → agentId) ────────────────────────────
ALTER TABLE "EvalRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EvalRun" FORCE ROW LEVEL SECURITY;
ALTER TABLE "EvalRun" OWNER TO postgres;

CREATE POLICY "eval_run_tenant_select" ON "EvalRun"
  FOR SELECT
  USING (
    "suiteId" IN (
      SELECT es.id FROM "EvalSuite" es
      WHERE es."agentId" IN (
        SELECT id FROM "Agent"
        WHERE "organizationId" = current_setting('app.current_org_id', true)
           OR ("organizationId" IS NULL AND current_setting('app.current_org_id', true) IS DISTINCT FROM '')
      )
    )
  );

CREATE POLICY "eval_run_tenant_insert" ON "EvalRun"
  FOR INSERT
  WITH CHECK (
    "suiteId" IN (
      SELECT es.id FROM "EvalSuite" es
      WHERE es."agentId" IN (
        SELECT id FROM "Agent"
        WHERE "organizationId" = current_setting('app.current_org_id', true)
           OR ("organizationId" IS NULL AND current_setting('app.current_org_id', true) IS DISTINCT FROM '')
      )
    )
  );

CREATE POLICY "eval_run_tenant_update" ON "EvalRun"
  FOR UPDATE
  USING (
    "suiteId" IN (
      SELECT es.id FROM "EvalSuite" es
      WHERE es."agentId" IN (
        SELECT id FROM "Agent"
        WHERE "organizationId" = current_setting('app.current_org_id', true)
           OR ("organizationId" IS NULL AND current_setting('app.current_org_id', true) IS DISTINCT FROM '')
      )
    )
  );

CREATE POLICY "eval_run_tenant_delete" ON "EvalRun"
  FOR DELETE
  USING (
    "suiteId" IN (
      SELECT es.id FROM "EvalSuite" es
      WHERE es."agentId" IN (
        SELECT id FROM "Agent"
        WHERE "organizationId" = current_setting('app.current_org_id', true)
           OR ("organizationId" IS NULL AND current_setting('app.current_org_id', true) IS DISTINCT FROM '')
      )
    )
  );

-- ── EvalResult (chain: runId → EvalRun → suiteId → EvalSuite → agentId) ──────
ALTER TABLE "EvalResult" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EvalResult" FORCE ROW LEVEL SECURITY;
ALTER TABLE "EvalResult" OWNER TO postgres;

CREATE POLICY "eval_result_tenant_select" ON "EvalResult"
  FOR SELECT
  USING (
    "runId" IN (
      SELECT er.id FROM "EvalRun" er
      JOIN "EvalSuite" es ON es.id = er."suiteId"
      JOIN "Agent" a ON a.id = es."agentId"
      WHERE a."organizationId" = current_setting('app.current_org_id', true)
         OR (a."organizationId" IS NULL AND current_setting('app.current_org_id', true) IS DISTINCT FROM '')
    )
  );

CREATE POLICY "eval_result_tenant_insert" ON "EvalResult"
  FOR INSERT
  WITH CHECK (
    "runId" IN (
      SELECT er.id FROM "EvalRun" er
      JOIN "EvalSuite" es ON es.id = er."suiteId"
      JOIN "Agent" a ON a.id = es."agentId"
      WHERE a."organizationId" = current_setting('app.current_org_id', true)
         OR (a."organizationId" IS NULL AND current_setting('app.current_org_id', true) IS DISTINCT FROM '')
    )
  );

CREATE POLICY "eval_result_tenant_update" ON "EvalResult"
  FOR UPDATE
  USING (
    "runId" IN (
      SELECT er.id FROM "EvalRun" er
      JOIN "EvalSuite" es ON es.id = er."suiteId"
      JOIN "Agent" a ON a.id = es."agentId"
      WHERE a."organizationId" = current_setting('app.current_org_id', true)
         OR (a."organizationId" IS NULL AND current_setting('app.current_org_id', true) IS DISTINCT FROM '')
    )
  );

CREATE POLICY "eval_result_tenant_delete" ON "EvalResult"
  FOR DELETE
  USING (
    "runId" IN (
      SELECT er.id FROM "EvalRun" er
      JOIN "EvalSuite" es ON es.id = er."suiteId"
      JOIN "Agent" a ON a.id = es."agentId"
      WHERE a."organizationId" = current_setting('app.current_org_id', true)
         OR (a."organizationId" IS NULL AND current_setting('app.current_org_id', true) IS DISTINCT FROM '')
    )
  );
