-- Migration: 20260406_add_skill_composition_layer
--
-- Adds compositionLayer column to Skill table.
-- This column was added to schema.prisma via db:push only and was never
-- included in a migration, causing 500 errors on GET /api/skills in production.
--
-- Safe to run multiple times (IF NOT EXISTS / DO block).

ALTER TABLE "Skill" ADD COLUMN IF NOT EXISTS "compositionLayer" TEXT NOT NULL DEFAULT 'execution';

CREATE INDEX IF NOT EXISTS "Skill_compositionLayer_idx" ON "Skill"("compositionLayer");
