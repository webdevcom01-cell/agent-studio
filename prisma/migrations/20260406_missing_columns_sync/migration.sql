-- Migration: 20260406_missing_columns_sync
--
-- Adds columns that exist in schema.prisma but were never in any migration
-- (added locally via db:push, never synced to production Railway DB).
-- All statements use IF NOT EXISTS so this is safe to run multiple times.

-- KnowledgeBase: fusionStrategy (added after 20260327_schema_sync)
ALTER TABLE "KnowledgeBase" ADD COLUMN IF NOT EXISTS "fusionStrategy" TEXT NOT NULL DEFAULT 'rrf';

-- User: soft-delete fields
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletionRequestedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletionScheduledFor" TIMESTAMP(3);
