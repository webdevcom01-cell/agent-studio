-- RLS: allow cross-org SELECT of PUBLIC agents (marketplace / discover).
--
-- The strict org-only "agent_select_policy" (from 20260521000000_hal8_null_exploit_hotfix)
-- hid public agents from other orgs under enforcement, which breaks the discover/
-- marketplace page: it reads public agents cross-org via withOrgContext() (app_user).
-- Caught by skills/rls-rollout/tests/public-routes.test.ts during the Phase 2 dry-run.
--
-- PostgreSQL ORs multiple PERMISSIVE SELECT policies, so this ADDS public-read
-- visibility WITHOUT weakening the strict org policy (the HAL-8 hardening stays
-- intact). Write policies (INSERT/UPDATE/DELETE) remain strict — public read does
-- NOT grant write. Private agents (isPublic = false) stay fully isolated.

CREATE POLICY "agent_select_public" ON "Agent"
  FOR SELECT
  USING ("isPublic" = true);

-- =========================================================================
-- Rollback (commented — uncomment to revert)
-- =========================================================================
-- DROP POLICY IF EXISTS "agent_select_public" ON "Agent";
