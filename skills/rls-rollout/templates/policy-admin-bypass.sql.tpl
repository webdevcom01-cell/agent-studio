-- =========================================================================
-- Admin bypass setup (reference, not per-table)
-- =========================================================================
-- This template is informational. The actual admin bypass is achieved by:
--   1. admin_user role has BYPASSRLS attribute (set in create-roles migration)
--   2. Application code uses prismaAdmin client (DATABASE_URL_ADMIN_USER)
--      for routes that require cross-tenant access
--
-- DO NOT create per-table policies named *_admin — they're redundant.
-- admin_user bypasses all policies by virtue of the role attribute.
--
-- Routes that should use admin_user:
--   - /api/admin/* (when ADMIN_USER_IDS matches)
--   - /api/user/export (GDPR — user's own data across all orgs)
--   - /api/user/account (GDPR deletion)
--   - BullMQ handlers: budget.monthly.reset, governance.timeout
--   - All cron routes that scan across orgs

-- =========================================================================
-- Verification queries — confirm admin_user bypasses RLS
-- =========================================================================

-- Should return: bypassrls = t
SELECT rolname, rolbypassrls
FROM pg_roles
WHERE rolname IN ('app_user', 'admin_user');

-- Expected output:
--   rolname     | rolbypassrls
--   ------------|--------------
--   app_user    | f
--   admin_user  | t

-- =========================================================================
-- If admin_user accidentally lost BYPASSRLS (after a manual migration)
-- =========================================================================
-- ALTER ROLE admin_user BYPASSRLS;
--
-- Verify:
-- SELECT rolbypassrls FROM pg_roles WHERE rolname = 'admin_user';
