-- RLS Status Checker — DB STATE queries
-- Run as a batch via psql $DATABASE_URL
-- All queries are read-only (SELECT only).

-- M1: Applied migrations (latest 10)
-- Purpose: confirm recent migrations are deployed; compare count to file count
SELECT migration_name,
       finished_at::date AS applied
FROM _prisma_migrations
WHERE finished_at IS NOT NULL
ORDER BY started_at DESC
LIMIT 10;

-- M2: NULL-org agent count
-- Purpose: Phase 0d completion check — must be 0 after backfill
SELECT COUNT(*)::int AS null_org_count
FROM "Agent"
WHERE "organizationId" IS NULL;

-- M3: Total RLS policy count in public schema
-- Purpose: Phase 1+ progress tracking — target ≥ 32 (4 policies × 8 tables)
SELECT COUNT(*)::int AS policy_count
FROM pg_policies
WHERE schemaname = 'public';

-- M4: ENABLE + FORCE RLS on 8 target tables
-- Purpose: verify both flags are set on all Phase 1 TENANT_DIRECT tables
SELECT tablename,
       rowsecurity      AS enabled,
       forcerowsecurity AS forced
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'Agent',
    'Flow',
    'KBSource',
    'KBChunk',
    'Conversation',
    'AgentExecution',
    'CostEvent',
    'Template'
  )
ORDER BY tablename;

-- M5: DB roles (Phase 0b completion check)
-- Purpose: confirm app_user and admin_user roles exist with correct BYPASSRLS
SELECT rolname,
       rolbypassrls
FROM pg_roles
WHERE rolname IN ('app_user', 'admin_user');

-- M6: Organization count (Phase 0d proxy)
-- Purpose: after personal org backfill, count must be > 1
SELECT COUNT(*)::int AS org_count
FROM "Organization";
