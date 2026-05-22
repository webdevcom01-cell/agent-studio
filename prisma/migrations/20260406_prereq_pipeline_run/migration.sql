-- Pre-requisite for 20260407_add_pipeline_memory_and_hitl on fresh databases.
-- PipelineRunStatus and PipelineRun were added via db:push and never migrated.
-- All statements use IF NOT EXISTS / DO blocks for idempotency on existing DBs.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_type WHERE typname = 'PipelineRunStatus') THEN
    CREATE TYPE "PipelineRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "PipelineRun" (
    "id"              TEXT NOT NULL,
    "status"          "PipelineRunStatus" NOT NULL DEFAULT 'PENDING',
    "taskDescription" TEXT NOT NULL,
    "taskType"        TEXT NOT NULL,
    "complexity"      TEXT NOT NULL,
    "pipeline"        TEXT[],
    "currentStep"     INTEGER NOT NULL DEFAULT 0,
    "stepResults"     JSONB NOT NULL DEFAULT '{}',
    "stepMetrics"     JSONB NOT NULL DEFAULT '{}',
    "finalOutput"     TEXT,
    "error"           TEXT,
    "jobId"           TEXT,
    "agentId"         TEXT NOT NULL,
    "userId"          TEXT,
    "repoUrl"         TEXT,
    "sourceRepoUrl"   TEXT,
    "prUrl"           TEXT,
    "startedAt"       TIMESTAMP(3),
    "completedAt"     TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PipelineRun_jobId_key"
    ON "PipelineRun"("jobId");

DO $$ BEGIN
  ALTER TABLE "PipelineRun"
    ADD CONSTRAINT "PipelineRun_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "PipelineRun_agentId_status_idx"  ON "PipelineRun"("agentId", "status");
CREATE INDEX IF NOT EXISTS "PipelineRun_userId_idx"          ON "PipelineRun"("userId");
CREATE INDEX IF NOT EXISTS "PipelineRun_status_createdAt_idx" ON "PipelineRun"("status", "createdAt");
