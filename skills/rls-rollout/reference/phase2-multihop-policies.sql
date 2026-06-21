-- =============================================================================
-- Phase 2 (TENANT_INDIRECT) — hand-authored multi-hop RLS policies
-- =============================================================================
-- The 8 models below reach Agent.organizationId through 2–3 FK hops, which the
-- single-hop generator template cannot express. Each policy is a nested IN
-- subquery that bottoms out at Agent.organizationId, scoped to the current org
-- via current_setting('app.current_org_id', true).
--
-- FK columns verified against prisma/schema.prisma on 2026-06-21.
--
-- CORRECTION vs step1-inventory.ts tenantPath: WebhookExecution is anchored on
-- webhookConfigId (NOT NULL), NOT the inferred conversationId (which is
-- nullable — a NULL anchor would hide legitimate rows and is the wrong owner).
--
-- Notes:
--   * Idempotent (DROP POLICY IF EXISTS before CREATE) — safe to re-run.
--   * admin_user has BYPASSRLS, so these policies do not constrain it.
--   * Intermediate parents (KnowledgeBase, Conversation, Flow, FlowSchedule,
--     WebhookConfig, EvalSuite) carry their own RLS; the subqueries still
--     resolve correctly (same-org filtering compounds, never widens). All FK
--     anchors are indexed, and Agent(organizationId, id) exists (Phase 1), so
--     the subqueries stay index-backed.
--   * Apply to STAGING first, then run STEP 4 verify-staging before prod.
-- =============================================================================


-- =============================================================================
-- KBSource — knowledgeBaseId → KnowledgeBase.agentId → Agent.organizationId
-- =============================================================================
CREATE INDEX IF NOT EXISTS "KBSource_knowledgeBaseId_id_idx"
  ON "KBSource" ("knowledgeBaseId", "id");

ALTER TABLE "KBSource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KBSource" FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON "KBSource" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "KBSource" TO admin_user;

DROP POLICY IF EXISTS kbsource_select ON "KBSource";
DROP POLICY IF EXISTS kbsource_insert ON "KBSource";
DROP POLICY IF EXISTS kbsource_update ON "KBSource";
DROP POLICY IF EXISTS kbsource_delete ON "KBSource";

CREATE POLICY kbsource_select ON "KBSource"
  FOR SELECT TO app_user
  USING (
    "knowledgeBaseId" IN (
      SELECT id FROM "KnowledgeBase" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY kbsource_insert ON "KBSource"
  FOR INSERT TO app_user
  WITH CHECK (
    "knowledgeBaseId" IN (
      SELECT id FROM "KnowledgeBase" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY kbsource_update ON "KBSource"
  FOR UPDATE TO app_user
  USING (
    "knowledgeBaseId" IN (
      SELECT id FROM "KnowledgeBase" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  )
  WITH CHECK (
    "knowledgeBaseId" IN (
      SELECT id FROM "KnowledgeBase" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY kbsource_delete ON "KBSource"
  FOR DELETE TO app_user
  USING (
    "knowledgeBaseId" IN (
      SELECT id FROM "KnowledgeBase" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );


-- =============================================================================
-- KBChunk — sourceId → KBSource.knowledgeBaseId → KnowledgeBase.agentId → Agent.org
-- =============================================================================
CREATE INDEX IF NOT EXISTS "KBChunk_sourceId_id_idx"
  ON "KBChunk" ("sourceId", "id");

ALTER TABLE "KBChunk" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KBChunk" FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON "KBChunk" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "KBChunk" TO admin_user;

DROP POLICY IF EXISTS kbchunk_select ON "KBChunk";
DROP POLICY IF EXISTS kbchunk_insert ON "KBChunk";
DROP POLICY IF EXISTS kbchunk_update ON "KBChunk";
DROP POLICY IF EXISTS kbchunk_delete ON "KBChunk";

CREATE POLICY kbchunk_select ON "KBChunk"
  FOR SELECT TO app_user
  USING (
    "sourceId" IN (
      SELECT id FROM "KBSource" WHERE "knowledgeBaseId" IN (
        SELECT id FROM "KnowledgeBase" WHERE "agentId" IN (
          SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
        )
      )
    )
  );

CREATE POLICY kbchunk_insert ON "KBChunk"
  FOR INSERT TO app_user
  WITH CHECK (
    "sourceId" IN (
      SELECT id FROM "KBSource" WHERE "knowledgeBaseId" IN (
        SELECT id FROM "KnowledgeBase" WHERE "agentId" IN (
          SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
        )
      )
    )
  );

CREATE POLICY kbchunk_update ON "KBChunk"
  FOR UPDATE TO app_user
  USING (
    "sourceId" IN (
      SELECT id FROM "KBSource" WHERE "knowledgeBaseId" IN (
        SELECT id FROM "KnowledgeBase" WHERE "agentId" IN (
          SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
        )
      )
    )
  )
  WITH CHECK (
    "sourceId" IN (
      SELECT id FROM "KBSource" WHERE "knowledgeBaseId" IN (
        SELECT id FROM "KnowledgeBase" WHERE "agentId" IN (
          SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
        )
      )
    )
  );

CREATE POLICY kbchunk_delete ON "KBChunk"
  FOR DELETE TO app_user
  USING (
    "sourceId" IN (
      SELECT id FROM "KBSource" WHERE "knowledgeBaseId" IN (
        SELECT id FROM "KnowledgeBase" WHERE "agentId" IN (
          SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
        )
      )
    )
  );


-- =============================================================================
-- Message — conversationId → Conversation.agentId → Agent.organizationId
-- =============================================================================
CREATE INDEX IF NOT EXISTS "Message_conversationId_id_idx"
  ON "Message" ("conversationId", "id");

ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message" FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON "Message" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Message" TO admin_user;

DROP POLICY IF EXISTS message_select ON "Message";
DROP POLICY IF EXISTS message_insert ON "Message";
DROP POLICY IF EXISTS message_update ON "Message";
DROP POLICY IF EXISTS message_delete ON "Message";

CREATE POLICY message_select ON "Message"
  FOR SELECT TO app_user
  USING (
    "conversationId" IN (
      SELECT id FROM "Conversation" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY message_insert ON "Message"
  FOR INSERT TO app_user
  WITH CHECK (
    "conversationId" IN (
      SELECT id FROM "Conversation" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY message_update ON "Message"
  FOR UPDATE TO app_user
  USING (
    "conversationId" IN (
      SELECT id FROM "Conversation" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  )
  WITH CHECK (
    "conversationId" IN (
      SELECT id FROM "Conversation" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY message_delete ON "Message"
  FOR DELETE TO app_user
  USING (
    "conversationId" IN (
      SELECT id FROM "Conversation" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );


-- =============================================================================
-- FlowVersion — flowId → Flow.agentId → Agent.organizationId
-- =============================================================================
CREATE INDEX IF NOT EXISTS "FlowVersion_flowId_id_idx"
  ON "FlowVersion" ("flowId", "id");

ALTER TABLE "FlowVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FlowVersion" FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON "FlowVersion" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "FlowVersion" TO admin_user;

DROP POLICY IF EXISTS flowversion_select ON "FlowVersion";
DROP POLICY IF EXISTS flowversion_insert ON "FlowVersion";
DROP POLICY IF EXISTS flowversion_update ON "FlowVersion";
DROP POLICY IF EXISTS flowversion_delete ON "FlowVersion";

CREATE POLICY flowversion_select ON "FlowVersion"
  FOR SELECT TO app_user
  USING (
    "flowId" IN (
      SELECT id FROM "Flow" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY flowversion_insert ON "FlowVersion"
  FOR INSERT TO app_user
  WITH CHECK (
    "flowId" IN (
      SELECT id FROM "Flow" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY flowversion_update ON "FlowVersion"
  FOR UPDATE TO app_user
  USING (
    "flowId" IN (
      SELECT id FROM "Flow" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  )
  WITH CHECK (
    "flowId" IN (
      SELECT id FROM "Flow" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY flowversion_delete ON "FlowVersion"
  FOR DELETE TO app_user
  USING (
    "flowId" IN (
      SELECT id FROM "Flow" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );


-- =============================================================================
-- ScheduledExecution — flowScheduleId → FlowSchedule.agentId → Agent.org
-- =============================================================================
CREATE INDEX IF NOT EXISTS "ScheduledExecution_flowScheduleId_id_idx"
  ON "ScheduledExecution" ("flowScheduleId", "id");

ALTER TABLE "ScheduledExecution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScheduledExecution" FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON "ScheduledExecution" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ScheduledExecution" TO admin_user;

DROP POLICY IF EXISTS scheduledexecution_select ON "ScheduledExecution";
DROP POLICY IF EXISTS scheduledexecution_insert ON "ScheduledExecution";
DROP POLICY IF EXISTS scheduledexecution_update ON "ScheduledExecution";
DROP POLICY IF EXISTS scheduledexecution_delete ON "ScheduledExecution";

CREATE POLICY scheduledexecution_select ON "ScheduledExecution"
  FOR SELECT TO app_user
  USING (
    "flowScheduleId" IN (
      SELECT id FROM "FlowSchedule" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY scheduledexecution_insert ON "ScheduledExecution"
  FOR INSERT TO app_user
  WITH CHECK (
    "flowScheduleId" IN (
      SELECT id FROM "FlowSchedule" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY scheduledexecution_update ON "ScheduledExecution"
  FOR UPDATE TO app_user
  USING (
    "flowScheduleId" IN (
      SELECT id FROM "FlowSchedule" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  )
  WITH CHECK (
    "flowScheduleId" IN (
      SELECT id FROM "FlowSchedule" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY scheduledexecution_delete ON "ScheduledExecution"
  FOR DELETE TO app_user
  USING (
    "flowScheduleId" IN (
      SELECT id FROM "FlowSchedule" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );


-- =============================================================================
-- WebhookExecution — webhookConfigId → WebhookConfig.agentId → Agent.org
-- (Anchored on webhookConfigId, NOT the nullable conversationId.)
-- =============================================================================
CREATE INDEX IF NOT EXISTS "WebhookExecution_webhookConfigId_id_idx"
  ON "WebhookExecution" ("webhookConfigId", "id");

ALTER TABLE "WebhookExecution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebhookExecution" FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON "WebhookExecution" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "WebhookExecution" TO admin_user;

DROP POLICY IF EXISTS webhookexecution_select ON "WebhookExecution";
DROP POLICY IF EXISTS webhookexecution_insert ON "WebhookExecution";
DROP POLICY IF EXISTS webhookexecution_update ON "WebhookExecution";
DROP POLICY IF EXISTS webhookexecution_delete ON "WebhookExecution";

CREATE POLICY webhookexecution_select ON "WebhookExecution"
  FOR SELECT TO app_user
  USING (
    "webhookConfigId" IN (
      SELECT id FROM "WebhookConfig" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY webhookexecution_insert ON "WebhookExecution"
  FOR INSERT TO app_user
  WITH CHECK (
    "webhookConfigId" IN (
      SELECT id FROM "WebhookConfig" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY webhookexecution_update ON "WebhookExecution"
  FOR UPDATE TO app_user
  USING (
    "webhookConfigId" IN (
      SELECT id FROM "WebhookConfig" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  )
  WITH CHECK (
    "webhookConfigId" IN (
      SELECT id FROM "WebhookConfig" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY webhookexecution_delete ON "WebhookExecution"
  FOR DELETE TO app_user
  USING (
    "webhookConfigId" IN (
      SELECT id FROM "WebhookConfig" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );


-- =============================================================================
-- WebhookDeadLetter — webhookConfigId → WebhookConfig.agentId → Agent.org
-- =============================================================================
CREATE INDEX IF NOT EXISTS "WebhookDeadLetter_webhookConfigId_id_idx"
  ON "WebhookDeadLetter" ("webhookConfigId", "id");

ALTER TABLE "WebhookDeadLetter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebhookDeadLetter" FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON "WebhookDeadLetter" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "WebhookDeadLetter" TO admin_user;

DROP POLICY IF EXISTS webhookdeadletter_select ON "WebhookDeadLetter";
DROP POLICY IF EXISTS webhookdeadletter_insert ON "WebhookDeadLetter";
DROP POLICY IF EXISTS webhookdeadletter_update ON "WebhookDeadLetter";
DROP POLICY IF EXISTS webhookdeadletter_delete ON "WebhookDeadLetter";

CREATE POLICY webhookdeadletter_select ON "WebhookDeadLetter"
  FOR SELECT TO app_user
  USING (
    "webhookConfigId" IN (
      SELECT id FROM "WebhookConfig" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY webhookdeadletter_insert ON "WebhookDeadLetter"
  FOR INSERT TO app_user
  WITH CHECK (
    "webhookConfigId" IN (
      SELECT id FROM "WebhookConfig" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY webhookdeadletter_update ON "WebhookDeadLetter"
  FOR UPDATE TO app_user
  USING (
    "webhookConfigId" IN (
      SELECT id FROM "WebhookConfig" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  )
  WITH CHECK (
    "webhookConfigId" IN (
      SELECT id FROM "WebhookConfig" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY webhookdeadletter_delete ON "WebhookDeadLetter"
  FOR DELETE TO app_user
  USING (
    "webhookConfigId" IN (
      SELECT id FROM "WebhookConfig" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );


-- =============================================================================
-- EvalTestCase — suiteId → EvalSuite.agentId → Agent.organizationId
-- =============================================================================
CREATE INDEX IF NOT EXISTS "EvalTestCase_suiteId_id_idx"
  ON "EvalTestCase" ("suiteId", "id");

ALTER TABLE "EvalTestCase" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EvalTestCase" FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON "EvalTestCase" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "EvalTestCase" TO admin_user;

DROP POLICY IF EXISTS evaltestcase_select ON "EvalTestCase";
DROP POLICY IF EXISTS evaltestcase_insert ON "EvalTestCase";
DROP POLICY IF EXISTS evaltestcase_update ON "EvalTestCase";
DROP POLICY IF EXISTS evaltestcase_delete ON "EvalTestCase";

CREATE POLICY evaltestcase_select ON "EvalTestCase"
  FOR SELECT TO app_user
  USING (
    "suiteId" IN (
      SELECT id FROM "EvalSuite" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY evaltestcase_insert ON "EvalTestCase"
  FOR INSERT TO app_user
  WITH CHECK (
    "suiteId" IN (
      SELECT id FROM "EvalSuite" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY evaltestcase_update ON "EvalTestCase"
  FOR UPDATE TO app_user
  USING (
    "suiteId" IN (
      SELECT id FROM "EvalSuite" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  )
  WITH CHECK (
    "suiteId" IN (
      SELECT id FROM "EvalSuite" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );

CREATE POLICY evaltestcase_delete ON "EvalTestCase"
  FOR DELETE TO app_user
  USING (
    "suiteId" IN (
      SELECT id FROM "EvalSuite" WHERE "agentId" IN (
        SELECT id FROM "Agent" WHERE "organizationId" = current_setting('app.current_org_id', true)
      )
    )
  );


-- =============================================================================
-- Rollback (uncomment to revert all 8)
-- =============================================================================
-- DO $$ DECLARE t text; BEGIN
--   FOREACH t IN ARRAY ARRAY['KBSource','KBChunk','Message','FlowVersion',
--     'ScheduledExecution','WebhookExecution','WebhookDeadLetter','EvalTestCase']
--   LOOP
--     EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', t);
--   END LOOP;
-- END $$;
