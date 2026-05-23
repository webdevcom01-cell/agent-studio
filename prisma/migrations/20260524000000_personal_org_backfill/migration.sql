-- ============================================================================
-- Phase 0d — Personal org backfill migration
--
-- Creates a personal Organization for every user who owns Agent rows with
-- organizationId = NULL, then assigns those agents to the personal org.
-- Eliminates the NULL-tenancy code path and satisfies the RLS invariant
-- that every Agent row has a non-NULL organizationId.
--
-- Idempotent:
--   - Organization insert: ON CONFLICT (slug) DO NOTHING
--   - OrganizationMember insert: ON CONFLICT (userId, organizationId) DO NOTHING
--   - Agent update: WHERE organizationId IS NULL (no-op when already backfilled)
--
-- Post-migration invariant:
--   SELECT COUNT(*) FROM "Agent" WHERE "organizationId" IS NULL  → 0
--   SELECT COUNT(*) FROM "Organization"                          > 0 (may be > 1)
--   SELECT COUNT(*) FROM "OrganizationMember" WHERE role='OWNER' > 0
--
-- Note: On the production database this migration is a no-op because
-- Phase 0a.5 (HAL-8 hotfix) already backfilled the single production user.
-- On fresh CI databases there are no agents, so Steps 1–3 are also no-ops.
-- The sanity check in Step 4 will pass in both cases (0 NULL-org agents).
-- ============================================================================

BEGIN;

-- ── Step 1: Create a personal Organization for each user with NULL-org agents ──
--
-- Slug: 'personal-' || user.id — deterministic, unique per user.
-- Name: "<user name or email>'s Workspace", falling back to 'Personal Workspace'.
-- ON CONFLICT (slug) DO NOTHING makes this idempotent.

INSERT INTO "Organization" (id, name, slug, plan, "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  COALESCE(u.name, u.email, 'Personal') || '''s Workspace',
  'personal-' || u.id,
  'FREE',
  NOW(),
  NOW()
FROM (
  SELECT DISTINCT a."userId"
  FROM "Agent" a
  WHERE a."organizationId" IS NULL
    AND a."userId" IS NOT NULL
) AS affected_users
JOIN "User" u ON u.id = affected_users."userId"
ON CONFLICT (slug) DO NOTHING;

-- ── Step 2: Create OWNER membership for each personal org ────────────────────
--
-- Look up the org by its deterministic slug (may have been created above or
-- pre-existing from a previous run / HAL-8 hotfix).
-- ON CONFLICT (userId, organizationId) DO NOTHING makes this idempotent.

INSERT INTO "OrganizationMember" (id, "userId", "organizationId", role, "joinedAt")
SELECT
  gen_random_uuid()::text,
  u.id,
  o.id,
  'OWNER',
  NOW()
FROM (
  SELECT DISTINCT a."userId"
  FROM "Agent" a
  WHERE a."organizationId" IS NULL
    AND a."userId" IS NOT NULL
) AS affected_users
JOIN "User" u ON u.id = affected_users."userId"
JOIN "Organization" o ON o.slug = 'personal-' || u.id
ON CONFLICT ("userId", "organizationId") DO NOTHING;

-- ── Step 3: Assign NULL-org agents to their owner's personal org ──────────────
--
-- Joins via the deterministic slug so the correct org is always chosen
-- regardless of whether it was created in Step 1 or already existed.

UPDATE "Agent" a
SET
  "organizationId" = o.id,
  "updatedAt"      = NOW()
FROM "User" u
JOIN "Organization" o ON o.slug = 'personal-' || u.id
WHERE a."organizationId" IS NULL
  AND a."userId" = u.id;

-- ── Step 4: Sanity check ──────────────────────────────────────────────────────
--
-- Fail the transaction if any NULL-org Agent rows remain.
-- Remaining NULL-org agents indicate agents with userId = NULL (orphaned agents
-- with no owner and therefore no personal org to assign them to).
-- This condition requires manual investigation before the migration can proceed.

DO $$
DECLARE
  v_null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_null_count
  FROM "Agent"
  WHERE "organizationId" IS NULL;

  IF v_null_count > 0 THEN
    RAISE EXCEPTION
      'Phase 0d backfill incomplete: % Agent row(s) still have organizationId = NULL. '
      'These agents likely have userId = NULL (orphaned). '
      'Investigate with: SELECT id, "userId", name FROM "Agent" WHERE "organizationId" IS NULL; '
      'and manually assign or delete them before re-running this migration.',
      v_null_count;
  END IF;
END$$;

COMMIT;

-- ── Post-migration verification queries (run manually to confirm) ─────────────
--
-- SELECT COUNT(*) FROM "Agent" WHERE "organizationId" IS NULL;
--   Expected: 0
--
-- SELECT COUNT(*) FROM "Organization";
--   Expected: > 0
--
-- SELECT COUNT(*) FROM "OrganizationMember" WHERE role = 'OWNER';
--   Expected: > 0
