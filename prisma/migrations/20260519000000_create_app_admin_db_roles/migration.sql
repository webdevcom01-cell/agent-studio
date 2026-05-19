-- Phase 0b: Create least-privilege DB roles for RLS enforcement
--
-- app_user  — NOBYPASSRLS, standard app traffic, RLS policies enforced
-- admin_user — BYPASSRLS, admin routes + ADMIN_USER_IDS paths
--
-- Passwords set to placeholder — passwords MUST be set manually before use:
--   Railway Dashboard → Postgres → Query tab:
--     ALTER ROLE app_user PASSWORD '<openssl rand -base64 32>';
--     ALTER ROLE admin_user PASSWORD '<openssl rand -base64 32>';
--
-- Safe to re-run: DO blocks check existence before acting.

-- ── app_user ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOBYPASSRLS
      LOGIN
      PASSWORD 'CHANGE_ME_VIA_RAILWAY_CONSOLE';
  END IF;
END
$$;

-- ── admin_user ────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'admin_user') THEN
    CREATE ROLE admin_user
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      BYPASSRLS
      LOGIN
      PASSWORD 'CHANGE_ME_VIA_RAILWAY_CONSOLE';
  END IF;
END
$$;

-- ── Database access ───────────────────────────────────────────────────────────
GRANT CONNECT ON DATABASE railway TO app_user;
GRANT CONNECT ON DATABASE railway TO admin_user;

-- ── Schema access ─────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO app_user;
GRANT USAGE ON SCHEMA public TO admin_user;

-- ── DML on all existing tables ────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO admin_user;

-- ── Sequences (cuid/serial auto-increment) ────────────────────────────────────
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO admin_user;

-- ── Default privileges for tables/sequences created by future migrations ──────
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO admin_user;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO admin_user;

-- ── Revoke write access to Prisma migration tracking table ───────────────────
-- app_user and admin_user get DML on ALL TABLES above, which includes
-- _prisma_migrations. Only postgres (owner) should be able to modify it.
REVOKE INSERT, UPDATE, DELETE ON TABLE "_prisma_migrations" FROM app_user;
REVOKE INSERT, UPDATE, DELETE ON TABLE "_prisma_migrations" FROM admin_user;
