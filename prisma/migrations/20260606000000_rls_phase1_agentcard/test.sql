-- =============================================================================
-- AgentCard RLS — Cross-tenant + isPublic smoke tests
-- Phase 1 #12 | ADR-0001 (TENANT_INDIRECT via EXISTS subquery against Agent)
--
-- PLACEHOLDER — execute manually against staging as admin_user.
-- No automated RLS integration harness exists yet; see the it.skip() block in
-- src/lib/db/__tests__/rls-middleware.test.ts for the TODO when one is wired up.
--
-- Prerequisites:
--   1. Migration 20260606000000_rls_phase1_agentcard has been applied.
--   2. Run as admin_user (BYPASSRLS) so fixture setup is not blocked by policies.
--   3. DATABASE_URL points to staging (NOT production).
--
-- Cleanup: run the CLEANUP block at the bottom after all tests pass.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- SETUP — insert two orgs, two agents (one per org), two AgentCards
-- ---------------------------------------------------------------------------
BEGIN;

INSERT INTO "Organization" (id, name, slug, plan, "createdAt", "updatedAt")
VALUES
  ('rls-test-org-a', 'RLS Test Org A', 'rls-test-a', 'FREE', NOW(), NOW()),
  ('rls-test-org-b', 'RLS Test Org B', 'rls-test-b', 'FREE', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO "User" (id, email, "createdAt", "updatedAt")
VALUES ('rls-test-user-a', 'rls-a@test.internal', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Agent A: belongs to Org A
INSERT INTO "Agent" (id, name, "userId", "organizationId", model, "createdAt", "updatedAt")
VALUES ('rls-agent-a', 'RLS Agent A', 'rls-test-user-a', 'rls-test-org-a', 'deepseek-chat', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Agent B: belongs to Org B
INSERT INTO "Agent" (id, name, "userId", "organizationId", model, "createdAt", "updatedAt")
VALUES ('rls-agent-b', 'RLS Agent B', 'rls-test-user-a', 'rls-test-org-b', 'deepseek-chat', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- AgentCard A: private, belongs to Agent A (Org A)
INSERT INTO "AgentCard" ("id", "agentId", "isPublic", "skills", "updatedAt")
VALUES ('rls-card-a', 'rls-agent-a', false, '[]', NOW())
ON CONFLICT ("agentId") DO UPDATE SET "isPublic" = false;

-- AgentCard B: PUBLIC, belongs to Agent B (Org B)
INSERT INTO "AgentCard" ("id", "agentId", "isPublic", "skills", "updatedAt")
VALUES ('rls-card-b', 'rls-agent-b', true, '[]', NOW())
ON CONFLICT ("agentId") DO UPDATE SET "isPublic" = true;

COMMIT;

-- ---------------------------------------------------------------------------
-- TEST 1 — Org A can SELECT its own AgentCard (EXISTS = true)
-- Expected: 1 row returned (rls-card-a)
-- ---------------------------------------------------------------------------
BEGIN;
SET LOCAL "app.current_org_id" = 'rls-test-org-a';
SELECT id, "agentId", "isPublic"
FROM "AgentCard"
WHERE id = 'rls-card-a';
-- Expected: 1 row { id: 'rls-card-a', agentId: 'rls-agent-a', isPublic: false }
ROLLBACK;

-- ---------------------------------------------------------------------------
-- TEST 2 — Org A can SELECT AgentCard from Org B when isPublic = true
-- Expected: 1 row returned (cross-org public read)
-- ---------------------------------------------------------------------------
BEGIN;
SET LOCAL "app.current_org_id" = 'rls-test-org-a';
SELECT id, "agentId", "isPublic"
FROM "AgentCard"
WHERE id = 'rls-card-b';
-- Expected: 1 row { id: 'rls-card-b', agentId: 'rls-agent-b', isPublic: true }
ROLLBACK;

-- Negative check: Org A cannot see a PRIVATE card from Org B
BEGIN;
SET LOCAL "app.current_org_id" = 'rls-test-org-a';
-- Temporarily make card-b private for this sub-test
UPDATE "AgentCard" SET "isPublic" = false WHERE id = 'rls-card-b';
-- Restore will happen in ROLLBACK
SELECT id FROM "AgentCard" WHERE id = 'rls-card-b';
-- Expected: 0 rows (private card from another org is hidden)
ROLLBACK;
-- (ROLLBACK restores isPublic = true on rls-card-b)

-- ---------------------------------------------------------------------------
-- TEST 3 — Org A cannot UPDATE AgentCard belonging to Agent from Org B
-- Expected: UPDATE 0 (RLS hides the row; no 42501 on UPDATE USING)
--           even when the card is public (isPublic = true)
-- ---------------------------------------------------------------------------
BEGIN;
SET LOCAL "app.current_org_id" = 'rls-test-org-a';
UPDATE "AgentCard"
SET skills = '[{"id":"pwned"}]'
WHERE id = 'rls-card-b';
-- Expected: UPDATE 0
-- Verify: card-b is unchanged
SELECT skills FROM "AgentCard" WHERE id = 'rls-card-b';
-- Expected: '[]' (not pwned)
ROLLBACK;

-- ---------------------------------------------------------------------------
-- TEST 4 — Org A cannot INSERT AgentCard with agentId from Org B
-- Expected: ERROR 42501 (new row violates row-level security policy)
-- ---------------------------------------------------------------------------
BEGIN;
SET LOCAL "app.current_org_id" = 'rls-test-org-a';
-- rls-agent-b belongs to Org B — INSERT should be blocked by WITH CHECK
INSERT INTO "AgentCard" ("id", "agentId", "isPublic", "skills", "updatedAt")
VALUES ('rls-card-inject', 'rls-agent-b', false, '[]', NOW());
-- Expected: ERROR 42501
-- If this INSERT succeeds, the INSERT policy is broken — escalate immediately.
ROLLBACK;

-- ---------------------------------------------------------------------------
-- ADMIN BYPASS SANITY CHECK — admin_user sees everything
-- Expected: 2 rows (both cards visible regardless of org context)
-- ---------------------------------------------------------------------------
SELECT id, "agentId", "isPublic"
FROM "AgentCard"
WHERE id IN ('rls-card-a', 'rls-card-b');
-- Run as admin_user (BYPASSRLS) — must return 2 rows.

-- ---------------------------------------------------------------------------
-- CLEANUP — remove all test fixtures
-- ---------------------------------------------------------------------------
-- DELETE FROM "AgentCard" WHERE id IN ('rls-card-a', 'rls-card-b');
-- DELETE FROM "Agent"     WHERE id IN ('rls-agent-a', 'rls-agent-b');
-- DELETE FROM "User"      WHERE id  = 'rls-test-user-a';
-- DELETE FROM "Organization" WHERE id IN ('rls-test-org-a', 'rls-test-org-b');
--
-- Or use CASCADE:
-- DELETE FROM "Organization" WHERE id IN ('rls-test-org-a', 'rls-test-org-b');
-- (Cascades to Agent → AgentCard via onDelete: Cascade)
