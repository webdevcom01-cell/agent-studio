-- ============================================================================
-- Migration: 20260403_missing_org_apikey_agent_cols
--
-- Adds tables and columns that were present in the Prisma schema but were
-- never included in a migration file, causing column-does-not-exist errors
-- on production when Prisma tried to SELECT/INSERT these fields.
--
-- Root cause: Organization, ApiKey, Agent.organizationId, and
--   Agent.expectedDurationSeconds were added to schema.prisma via `db:push`
--   only; they were never committed to a migration. This migration backfills
--   them so `prisma migrate deploy` on Railway correctly applies the DDL.
--
-- All statements use IF NOT EXISTS / conditional DO blocks so the migration
-- is safe to run even if parts already exist (e.g., on a staging DB that had
-- db:push run against it).
-- ============================================================================

-- ── 1. Enums ─────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "PlanTier" AS ENUM ('FREE', 'PRO', 'TEAM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. Organization ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Organization" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "slug"      TEXT NOT NULL,
    "plan"      "PlanTier" NOT NULL DEFAULT 'FREE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Organization_slug_key" ON "Organization"("slug");
CREATE INDEX IF NOT EXISTS "Organization_slug_idx" ON "Organization"("slug");

-- ── 3. OrganizationMember ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "OrganizationMember" (
    "id"             TEXT NOT NULL,
    "userId"         TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role"           "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationMember_userId_organizationId_key"
    ON "OrganizationMember"("userId", "organizationId");
CREATE INDEX IF NOT EXISTS "OrganizationMember_organizationId_idx"
    ON "OrganizationMember"("organizationId");

DO $$ BEGIN
  ALTER TABLE "OrganizationMember"
    ADD CONSTRAINT "OrganizationMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "OrganizationMember"
    ADD CONSTRAINT "OrganizationMember_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 4. Invitation ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Invitation" (
    "id"             TEXT NOT NULL,
    "email"          TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role"           "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "token"          TEXT NOT NULL,
    "expiresAt"      TIMESTAMP(3) NOT NULL,
    "acceptedAt"     TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Invitation_token_key" ON "Invitation"("token");
CREATE INDEX IF NOT EXISTS "Invitation_token_idx" ON "Invitation"("token");
CREATE INDEX IF NOT EXISTS "Invitation_email_organizationId_idx"
    ON "Invitation"("email", "organizationId");

DO $$ BEGIN
  ALTER TABLE "Invitation"
    ADD CONSTRAINT "Invitation_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 5. ApiKey ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ApiKey" (
    "id"          TEXT NOT NULL,
    "keyHash"     TEXT NOT NULL,
    "keyPrefix"   TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "scopes"      TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiresAt"   TIMESTAMP(3),
    "lastUsedAt"  TIMESTAMP(3),
    "revokedAt"   TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ApiKey_keyHash_key" ON "ApiKey"("keyHash");
CREATE INDEX IF NOT EXISTS "ApiKey_keyHash_idx" ON "ApiKey"("keyHash");
CREATE INDEX IF NOT EXISTS "ApiKey_userId_idx" ON "ApiKey"("userId");
CREATE INDEX IF NOT EXISTS "ApiKey_userId_revokedAt_idx" ON "ApiKey"("userId", "revokedAt");

DO $$ BEGIN
  ALTER TABLE "ApiKey"
    ADD CONSTRAINT "ApiKey_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 6. Agent: new columns ──────────────────────────────────────────────────────

ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "organizationId"          TEXT;
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "expectedDurationSeconds" INTEGER;

-- FK: Agent.organizationId → Organization.id
DO $$ BEGIN
  ALTER TABLE "Agent"
    ADD CONSTRAINT "Agent_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "Agent_organizationId_idx" ON "Agent"("organizationId");
