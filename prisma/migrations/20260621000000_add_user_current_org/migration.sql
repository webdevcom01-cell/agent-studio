-- ============================================================================
-- Migration: 20260621000000_add_user_current_org
--
-- Adds User.currentOrgId to persist the organization a user has explicitly
-- switched into (POST /api/users/switch-org). The NextAuth jwt callback reads
-- this value and re-validates membership before trusting it; an invalid/stale
-- value falls back to the user's primary org (user_primary_org()).
--
-- Additive and backward-compatible: the column is nullable, so existing rows
-- and logins keep working (currentOrgId null -> primary-org resolution).
--
-- No FK constraint: currentOrgId is a soft pointer, validated at runtime, so a
-- dangling value after an Organization is deleted self-heals via the jwt
-- membership re-check instead of blocking the delete. Idempotent (IF NOT EXISTS)
-- to stay safe on databases that already had db:push run.
-- ============================================================================

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "currentOrgId" TEXT;
