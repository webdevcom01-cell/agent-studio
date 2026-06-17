-- Ensure SomaReviewPost.qualityFlags exists on fresh replays.
-- The original add (20260530224634) runs before the table is created on a clean
-- deploy and is now guarded, so this migration guarantees the column afterwards.
-- Type matches schema.prisma (qualityFlags Json? -> JSONB).
-- Idempotent: no-op where the column already exists (e.g. production).
ALTER TABLE "SomaReviewPost" ADD COLUMN IF NOT EXISTS "qualityFlags" JSONB;
