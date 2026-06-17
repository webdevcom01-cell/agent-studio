-- ============================================================================
-- Migration: 20260617000000_apikey_organization_id
--
-- Binds API keys to an organization so programmatic callers (e.g. the MCP
-- server) carry an explicit tenant org instead of inferring it. Additive and
-- backward-compatible: the column is nullable, so existing keys keep working
-- (auth falls back to the user's earliest org membership when it is null).
--
-- ApiKey is not under RLS (admin-only access via the BYPASSRLS DB role), so no
-- policy changes are required. All statements are idempotent (IF NOT EXISTS /
-- guarded DO blocks) to stay safe on databases that already had db:push run.
-- ============================================================================

ALTER TABLE "ApiKey" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

DO $$ BEGIN
  ALTER TABLE "ApiKey"
    ADD CONSTRAINT "ApiKey_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "ApiKey_organizationId_idx" ON "ApiKey"("organizationId");
