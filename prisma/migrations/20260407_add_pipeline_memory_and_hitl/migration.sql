-- Migration: 20260407_add_pipeline_memory_and_hitl
--
-- Adds AWAITING_APPROVAL pipeline status, approvalFeedback column, and
-- PipelineMemory model for cross-run learning.
--
-- All statements are idempotent — safe to run on DBs that already have
-- these changes applied via db:push (development + staging environments).

-- ── 1. Add AWAITING_APPROVAL to PipelineRunStatus enum ──────────────────────
-- PostgreSQL ≥14 supports ALTER TYPE ... ADD VALUE IF NOT EXISTS.
-- For broad compatibility we use a DO block that checks pg_enum first.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'AWAITING_APPROVAL'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'PipelineRunStatus')
  ) THEN
    ALTER TYPE "PipelineRunStatus" ADD VALUE 'AWAITING_APPROVAL';
  END IF;
END $$;

-- ── 2. Add approvalFeedback column to PipelineRun ───────────────────────────
ALTER TABLE "PipelineRun" ADD COLUMN IF NOT EXISTS "approvalFeedback" TEXT;

-- ── 3. Create PipelineMemory table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PipelineMemory" (
  "id"        TEXT NOT NULL,
  "agentId"   TEXT NOT NULL,
  "runId"     TEXT NOT NULL,
  "category"  TEXT NOT NULL,
  "content"   TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PipelineMemory_pkey" PRIMARY KEY ("id")
);

-- ── 4. Index on agentId for efficient per-agent memory retrieval ─────────────
CREATE INDEX IF NOT EXISTS "PipelineMemory_agentId_idx" ON "PipelineMemory"("agentId");
