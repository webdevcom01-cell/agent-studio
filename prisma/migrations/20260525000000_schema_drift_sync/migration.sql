-- Phase 0a.7b: Schema drift synchronization
--
-- Captures all schema additions that were previously bridged by
-- `prisma db push --accept-data-loss` in CI. After this migration,
-- the db push step is removed from .github/workflows/ci.yml.
--
-- Prod state at time of writing: migrations-only, none of these
-- tables/columns exist yet. IF NOT EXISTS guards are present as
-- a safety net in case the state differs.
--
-- Breakdown:
--   18 new tables  (Paperclip F1-F5 + BullMQ tasks + SDK sessions + webhooks)
--   14 new columns on existing tables
--    2 new enum types
--    1 enum value addition
--    3 column constraint changes
--   many new indexes + FK additions

-- ─── New enum types ────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SdkSessionStatus') THEN
    CREATE TYPE "SdkSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ABANDONED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ManagedTaskStatus') THEN
    CREATE TYPE "ManagedTaskStatus" AS ENUM ('PENDING', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED', 'ABANDONED');
  END IF;
END $$;

-- ─── Enum value addition ───────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = '"WebhookExecutionStatus"'::regtype
      AND enumlabel = 'QUEUED'
  ) THEN
    ALTER TYPE "WebhookExecutionStatus" ADD VALUE 'QUEUED';
  END IF;
END $$;

-- ─── Drop old index (replaced by compound index below) ─────────────────────

DROP INDEX IF EXISTS "PipelineMemory_agentId_idx";

-- ─── New columns on existing tables ────────────────────────────────────────

ALTER TABLE "Agent"
  ADD COLUMN IF NOT EXISTS "category"         TEXT,
  ADD COLUMN IF NOT EXISTS "departmentId"     TEXT,
  ADD COLUMN IF NOT EXISTS "isPublic"         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "parentAgentId"    TEXT,
  ADD COLUMN IF NOT EXISTS "pipelineVersion"  TEXT NOT NULL DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS "tags"             TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "AgentCallLog"
  ADD COLUMN IF NOT EXISTS "conversationId" TEXT;

ALTER TABLE "Flow"
  ADD COLUMN IF NOT EXISTS "lockVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP(3);

ALTER TABLE "WebhookConfig"
  ADD COLUMN IF NOT EXISTS "asyncExecution"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "issueKeyTemplate" TEXT;

ALTER TABLE "WebhookExecution"
  ADD COLUMN IF NOT EXISTS "issueKey"    TEXT,
  ADD COLUMN IF NOT EXISTS "retryCount"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "retryJobId"  TEXT;

-- ─── Column constraint changes (inherently idempotent) ────────────────────

-- Backfill NULLs before enforcing NOT NULL on EvalResult.assertions
UPDATE "EvalResult" SET "assertions" = '[]'::jsonb WHERE "assertions" IS NULL;
ALTER TABLE "EvalResult" ALTER COLUMN "assertions" SET NOT NULL;

ALTER TABLE "FlowTrace" ALTER COLUMN "executionPath" DROP DEFAULT;

ALTER TABLE "HumanApprovalRequest" ALTER COLUMN "userId" DROP NOT NULL;

-- ─── New tables ────────────────────────────────────────────────────────────

-- BullMQ managed long-running tasks (F-queue)
CREATE TABLE IF NOT EXISTS "ManagedAgentTask" (
    "id"          TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "status"      "ManagedTaskStatus" NOT NULL DEFAULT 'PENDING',
    "jobId"       TEXT,
    "input"       JSONB NOT NULL,
    "output"      JSONB,
    "error"       TEXT,
    "progress"    INTEGER NOT NULL DEFAULT 0,
    "callbackUrl" TEXT,
    "agentId"     TEXT NOT NULL,
    "userId"      TEXT,
    "startedAt"   TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ManagedAgentTask_pkey" PRIMARY KEY ("id")
);

-- claude_agent_sdk node DB-backed session persistence
CREATE TABLE IF NOT EXISTS "AgentSdkSession" (
    "id"                TEXT NOT NULL,
    "title"             TEXT,
    "status"            "SdkSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "messages"          JSONB NOT NULL DEFAULT '[]',
    "metadata"          JSONB,
    "totalInputTokens"  INTEGER NOT NULL DEFAULT 0,
    "totalOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "resumeCount"       INTEGER NOT NULL DEFAULT 0,
    "agentId"           TEXT NOT NULL,
    "userId"            TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentSdkSession_pkey" PRIMARY KEY ("id")
);

-- Webhook dead-letter queue
CREATE TABLE IF NOT EXISTS "WebhookDeadLetter" (
    "id"              TEXT NOT NULL,
    "webhookConfigId" TEXT NOT NULL,
    "executionId"     TEXT NOT NULL,
    "eventType"       TEXT,
    "payload"         TEXT,
    "headers"         JSONB,
    "errorMessage"    TEXT,
    "retryCount"      INTEGER NOT NULL DEFAULT 0,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebhookDeadLetter_pkey" PRIMARY KEY ("id")
);

-- F4: Goal Alignment — mission statement per org
CREATE TABLE IF NOT EXISTS "CompanyMission" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "statement"      TEXT NOT NULL,
    "vision"         TEXT,
    "values"         JSONB NOT NULL DEFAULT '[]',
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanyMission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Goal" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "missionId"      TEXT,
    "parentGoalId"   TEXT,
    "title"          TEXT NOT NULL,
    "description"    TEXT,
    "successMetric"  TEXT,
    "targetDate"     TIMESTAMP(3),
    "status"         TEXT NOT NULL DEFAULT 'ACTIVE',
    "priority"       INTEGER NOT NULL DEFAULT 50,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AgentGoalLink" (
    "id"        TEXT NOT NULL,
    "agentId"   TEXT NOT NULL,
    "goalId"    TEXT NOT NULL,
    "role"      TEXT NOT NULL DEFAULT 'CONTRIBUTOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentGoalLink_pkey" PRIMARY KEY ("id")
);

-- F3: Heartbeat Lifecycle
CREATE TABLE IF NOT EXISTS "HeartbeatConfig" (
    "id"              TEXT NOT NULL,
    "agentId"         TEXT NOT NULL,
    "organizationId"  TEXT NOT NULL,
    "enabled"         BOOLEAN NOT NULL DEFAULT true,
    "cronExpression"  TEXT NOT NULL,
    "timezone"        TEXT NOT NULL DEFAULT 'UTC',
    "systemPrompt"    TEXT,
    "maxContextItems" INTEGER NOT NULL DEFAULT 50,
    "flowScheduleId"  TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HeartbeatConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "HeartbeatContext" (
    "id"             TEXT NOT NULL,
    "agentId"        TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key"            TEXT NOT NULL,
    "value"          JSONB NOT NULL,
    "ttlSeconds"     INTEGER,
    "expiresAt"      TIMESTAMP(3),
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HeartbeatContext_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "HeartbeatRun" (
    "id"              TEXT NOT NULL,
    "agentId"         TEXT NOT NULL,
    "organizationId"  TEXT NOT NULL,
    "configId"        TEXT NOT NULL,
    "status"          TEXT NOT NULL,
    "startedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt"     TIMESTAMP(3),
    "durationMs"      INTEGER,
    "contextSnapshot" JSONB,
    "output"          JSONB,
    "error"           TEXT,
    CONSTRAINT "HeartbeatRun_pkey" PRIMARY KEY ("id")
);

-- F2: Agent Org Chart
CREATE TABLE IF NOT EXISTS "Department" (
    "id"             TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "description"    TEXT,
    "organizationId" TEXT NOT NULL,
    "parentId"       TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AgentPermissionGrant" (
    "id"              TEXT NOT NULL,
    "grantorAgentId"  TEXT NOT NULL,
    "granteeAgentId"  TEXT NOT NULL,
    "organizationId"  TEXT NOT NULL,
    "permission"      TEXT NOT NULL,
    "scope"           TEXT,
    "expiresAt"       TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentPermissionGrant_pkey" PRIMARY KEY ("id")
);

-- F1: Platform Budget
CREATE TABLE IF NOT EXISTS "AgentBudget" (
    "id"              TEXT NOT NULL,
    "agentId"         TEXT NOT NULL,
    "hardLimitUsd"    DECIMAL(10,2) NOT NULL DEFAULT 0,
    "softLimitUsd"    DECIMAL(10,2) NOT NULL DEFAULT 0,
    "alertThreshold"  DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "isHardStop"      BOOLEAN NOT NULL DEFAULT true,
    "periodStart"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentSpendUsd" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentBudget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CostEvent" (
    "id"           TEXT NOT NULL,
    "budgetId"     TEXT NOT NULL,
    "agentId"      TEXT NOT NULL,
    "costUsd"      DECIMAL(10,4) NOT NULL,
    "modelId"      TEXT NOT NULL,
    "inputTokens"  INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "source"       TEXT NOT NULL DEFAULT 'chat',
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CostEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BudgetAlert" (
    "id"        TEXT NOT NULL,
    "budgetId"  TEXT NOT NULL,
    "agentId"   TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "spendUsd"  DECIMAL(10,2) NOT NULL,
    "limitUsd"  DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BudgetAlert_pkey" PRIMARY KEY ("id")
);

-- Model performance tracking (global + per-agent rows; Phase 4 AMBIGUOUS candidate)
CREATE TABLE IF NOT EXISTS "ModelPerformanceStat" (
    "id"               TEXT NOT NULL,
    "agentId"          TEXT NOT NULL DEFAULT '',
    "modelId"          TEXT NOT NULL,
    "phase"            TEXT NOT NULL,
    "runCount"         INTEGER NOT NULL DEFAULT 0,
    "successCount"     INTEGER NOT NULL DEFAULT 0,
    "retryCount"       INTEGER NOT NULL DEFAULT 0,
    "totalInputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalDurationMs"  INTEGER NOT NULL DEFAULT 0,
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ModelPerformanceStat_pkey" PRIMARY KEY ("id")
);

-- F7: Clipmart Templates
CREATE TABLE IF NOT EXISTS "Template" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "description"    TEXT,
    "category"       TEXT NOT NULL DEFAULT 'GENERAL',
    "tags"           JSONB NOT NULL DEFAULT '[]',
    "version"        TEXT NOT NULL DEFAULT '1.0.0',
    "isPublic"       BOOLEAN NOT NULL DEFAULT false,
    "sourceAgentId"  TEXT,
    "importCount"    INTEGER NOT NULL DEFAULT 0,
    "payload"        JSONB NOT NULL,
    "checksum"       TEXT NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- F5: Board Governance
CREATE TABLE IF NOT EXISTS "ApprovalPolicy" (
    "id"             TEXT NOT NULL,
    "agentId"        TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "actionPattern"  TEXT NOT NULL,
    "approverIds"    TEXT[],
    "timeoutSeconds" INTEGER,
    "timeoutApprove" BOOLEAN NOT NULL DEFAULT false,
    "isActive"       BOOLEAN NOT NULL DEFAULT true,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ApprovalPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PolicyDecision" (
    "id"             TEXT NOT NULL,
    "policyId"       TEXT NOT NULL,
    "agentId"        TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "action"         TEXT NOT NULL,
    "context"        JSONB,
    "status"         TEXT NOT NULL DEFAULT 'PENDING',
    "resolvedBy"     TEXT,
    "resolvedAt"     TIMESTAMP(3),
    "resolverNote"   TEXT,
    "expiresAt"      TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PolicyDecision_pkey" PRIMARY KEY ("id")
);

-- ─── Indexes ───────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS "ManagedAgentTask_jobId_key"          ON "ManagedAgentTask"("jobId");
CREATE        INDEX IF NOT EXISTS "ManagedAgentTask_agentId_status_idx" ON "ManagedAgentTask"("agentId", "status");
CREATE        INDEX IF NOT EXISTS "ManagedAgentTask_userId_idx"         ON "ManagedAgentTask"("userId");
CREATE        INDEX IF NOT EXISTS "ManagedAgentTask_status_createdAt_idx" ON "ManagedAgentTask"("status", "createdAt");

CREATE        INDEX IF NOT EXISTS "AgentSdkSession_agentId_idx"         ON "AgentSdkSession"("agentId");
CREATE        INDEX IF NOT EXISTS "AgentSdkSession_userId_idx"          ON "AgentSdkSession"("userId");
CREATE        INDEX IF NOT EXISTS "AgentSdkSession_agentId_status_idx"  ON "AgentSdkSession"("agentId", "status");
CREATE        INDEX IF NOT EXISTS "AgentSdkSession_updatedAt_idx"       ON "AgentSdkSession"("updatedAt");

CREATE        INDEX IF NOT EXISTS "WebhookDeadLetter_webhookConfigId_idx" ON "WebhookDeadLetter"("webhookConfigId");
CREATE        INDEX IF NOT EXISTS "WebhookDeadLetter_createdAt_idx"       ON "WebhookDeadLetter"("createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "CompanyMission_organizationId_key" ON "CompanyMission"("organizationId");

CREATE        INDEX IF NOT EXISTS "Goal_organizationId_status_idx" ON "Goal"("organizationId", "status");
CREATE        INDEX IF NOT EXISTS "Goal_parentGoalId_idx"          ON "Goal"("parentGoalId");

CREATE        INDEX IF NOT EXISTS "AgentGoalLink_agentId_idx"         ON "AgentGoalLink"("agentId");
CREATE        INDEX IF NOT EXISTS "AgentGoalLink_goalId_idx"          ON "AgentGoalLink"("goalId");
CREATE UNIQUE INDEX IF NOT EXISTS "AgentGoalLink_agentId_goalId_key"  ON "AgentGoalLink"("agentId", "goalId");

CREATE UNIQUE INDEX IF NOT EXISTS "HeartbeatConfig_agentId_key"         ON "HeartbeatConfig"("agentId");
CREATE UNIQUE INDEX IF NOT EXISTS "HeartbeatConfig_flowScheduleId_key"  ON "HeartbeatConfig"("flowScheduleId");
CREATE        INDEX IF NOT EXISTS "HeartbeatConfig_organizationId_idx"  ON "HeartbeatConfig"("organizationId");

CREATE        INDEX IF NOT EXISTS "HeartbeatContext_agentId_idx"          ON "HeartbeatContext"("agentId");
CREATE        INDEX IF NOT EXISTS "HeartbeatContext_expiresAt_idx"        ON "HeartbeatContext"("expiresAt");
CREATE UNIQUE INDEX IF NOT EXISTS "HeartbeatContext_agentId_key_key"      ON "HeartbeatContext"("agentId", "key");

CREATE        INDEX IF NOT EXISTS "HeartbeatRun_agentId_startedAt_idx" ON "HeartbeatRun"("agentId", "startedAt");
CREATE        INDEX IF NOT EXISTS "HeartbeatRun_organizationId_idx"    ON "HeartbeatRun"("organizationId");

CREATE        INDEX IF NOT EXISTS "Department_organizationId_idx" ON "Department"("organizationId");
CREATE        INDEX IF NOT EXISTS "Department_parentId_idx"       ON "Department"("parentId");

CREATE        INDEX IF NOT EXISTS "AgentPermissionGrant_granteeAgentId_idx" ON "AgentPermissionGrant"("granteeAgentId");
CREATE        INDEX IF NOT EXISTS "AgentPermissionGrant_organizationId_idx"  ON "AgentPermissionGrant"("organizationId");
CREATE UNIQUE INDEX IF NOT EXISTS "AgentPermissionGrant_grantorAgentId_granteeAgentId_permissi_key"
  ON "AgentPermissionGrant"("grantorAgentId", "granteeAgentId", "permission", "scope");

CREATE UNIQUE INDEX IF NOT EXISTS "AgentBudget_agentId_key"    ON "AgentBudget"("agentId");
CREATE        INDEX IF NOT EXISTS "AgentBudget_agentId_idx"    ON "AgentBudget"("agentId");
CREATE        INDEX IF NOT EXISTS "AgentBudget_periodStart_idx" ON "AgentBudget"("periodStart");

CREATE        INDEX IF NOT EXISTS "CostEvent_budgetId_createdAt_idx" ON "CostEvent"("budgetId", "createdAt");
CREATE        INDEX IF NOT EXISTS "CostEvent_agentId_createdAt_idx"  ON "CostEvent"("agentId", "createdAt");

CREATE        INDEX IF NOT EXISTS "BudgetAlert_budgetId_createdAt_idx" ON "BudgetAlert"("budgetId", "createdAt");
CREATE        INDEX IF NOT EXISTS "BudgetAlert_agentId_createdAt_idx"  ON "BudgetAlert"("agentId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "ModelPerformanceStat_agentId_modelId_phase_key"
  ON "ModelPerformanceStat"("agentId", "modelId", "phase");

CREATE        INDEX IF NOT EXISTS "Template_organizationId_idx"      ON "Template"("organizationId");
CREATE        INDEX IF NOT EXISTS "Template_isPublic_category_idx"   ON "Template"("isPublic", "category");

CREATE        INDEX IF NOT EXISTS "ApprovalPolicy_agentId_idx"       ON "ApprovalPolicy"("agentId");
CREATE        INDEX IF NOT EXISTS "ApprovalPolicy_organizationId_idx" ON "ApprovalPolicy"("organizationId");

CREATE        INDEX IF NOT EXISTS "PolicyDecision_policyId_idx"              ON "PolicyDecision"("policyId");
CREATE        INDEX IF NOT EXISTS "PolicyDecision_agentId_status_idx"        ON "PolicyDecision"("agentId", "status");
CREATE        INDEX IF NOT EXISTS "PolicyDecision_organizationId_status_idx" ON "PolicyDecision"("organizationId", "status");
CREATE        INDEX IF NOT EXISTS "PolicyDecision_status_expiresAt_idx"      ON "PolicyDecision"("status", "expiresAt");

CREATE        INDEX IF NOT EXISTS "Agent_category_idx"          ON "Agent"("category");
CREATE        INDEX IF NOT EXISTS "Agent_isPublic_updatedAt_idx" ON "Agent"("isPublic", "updatedAt");

CREATE        INDEX IF NOT EXISTS "AgentCallLog_conversationId_idx" ON "AgentCallLog"("conversationId");

CREATE        INDEX IF NOT EXISTS "PipelineMemory_agentId_createdAt_idx"
  ON "PipelineMemory"("agentId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "WebhookExecution_webhookConfigId_issueKey_key"
  ON "WebhookExecution"("webhookConfigId", "issueKey");

-- ─── Foreign keys (guarded with pg_constraint existence check) ─────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Agent_departmentId_fkey') THEN
    ALTER TABLE "Agent" ADD CONSTRAINT "Agent_departmentId_fkey"
      FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Agent_parentAgentId_fkey') THEN
    ALTER TABLE "Agent" ADD CONSTRAINT "Agent_parentAgentId_fkey"
      FOREIGN KEY ("parentAgentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ManagedAgentTask_agentId_fkey') THEN
    ALTER TABLE "ManagedAgentTask" ADD CONSTRAINT "ManagedAgentTask_agentId_fkey"
      FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentSdkSession_agentId_fkey') THEN
    ALTER TABLE "AgentSdkSession" ADD CONSTRAINT "AgentSdkSession_agentId_fkey"
      FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Goal_missionId_fkey') THEN
    ALTER TABLE "Goal" ADD CONSTRAINT "Goal_missionId_fkey"
      FOREIGN KEY ("missionId") REFERENCES "CompanyMission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Goal_parentGoalId_fkey') THEN
    ALTER TABLE "Goal" ADD CONSTRAINT "Goal_parentGoalId_fkey"
      FOREIGN KEY ("parentGoalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentGoalLink_agentId_fkey') THEN
    ALTER TABLE "AgentGoalLink" ADD CONSTRAINT "AgentGoalLink_agentId_fkey"
      FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentGoalLink_goalId_fkey') THEN
    ALTER TABLE "AgentGoalLink" ADD CONSTRAINT "AgentGoalLink_goalId_fkey"
      FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HeartbeatConfig_agentId_fkey') THEN
    ALTER TABLE "HeartbeatConfig" ADD CONSTRAINT "HeartbeatConfig_agentId_fkey"
      FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HeartbeatConfig_flowScheduleId_fkey') THEN
    ALTER TABLE "HeartbeatConfig" ADD CONSTRAINT "HeartbeatConfig_flowScheduleId_fkey"
      FOREIGN KEY ("flowScheduleId") REFERENCES "FlowSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HeartbeatContext_agentId_fkey') THEN
    ALTER TABLE "HeartbeatContext" ADD CONSTRAINT "HeartbeatContext_agentId_fkey"
      FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HeartbeatRun_agentId_fkey') THEN
    ALTER TABLE "HeartbeatRun" ADD CONSTRAINT "HeartbeatRun_agentId_fkey"
      FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HeartbeatRun_configId_fkey') THEN
    ALTER TABLE "HeartbeatRun" ADD CONSTRAINT "HeartbeatRun_configId_fkey"
      FOREIGN KEY ("configId") REFERENCES "HeartbeatConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Department_parentId_fkey') THEN
    ALTER TABLE "Department" ADD CONSTRAINT "Department_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentPermissionGrant_grantorAgentId_fkey') THEN
    ALTER TABLE "AgentPermissionGrant" ADD CONSTRAINT "AgentPermissionGrant_grantorAgentId_fkey"
      FOREIGN KEY ("grantorAgentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentPermissionGrant_granteeAgentId_fkey') THEN
    ALTER TABLE "AgentPermissionGrant" ADD CONSTRAINT "AgentPermissionGrant_granteeAgentId_fkey"
      FOREIGN KEY ("granteeAgentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentBudget_agentId_fkey') THEN
    ALTER TABLE "AgentBudget" ADD CONSTRAINT "AgentBudget_agentId_fkey"
      FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CostEvent_budgetId_fkey') THEN
    ALTER TABLE "CostEvent" ADD CONSTRAINT "CostEvent_budgetId_fkey"
      FOREIGN KEY ("budgetId") REFERENCES "AgentBudget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BudgetAlert_budgetId_fkey') THEN
    ALTER TABLE "BudgetAlert" ADD CONSTRAINT "BudgetAlert_budgetId_fkey"
      FOREIGN KEY ("budgetId") REFERENCES "AgentBudget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ApprovalPolicy_agentId_fkey') THEN
    ALTER TABLE "ApprovalPolicy" ADD CONSTRAINT "ApprovalPolicy_agentId_fkey"
      FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PolicyDecision_policyId_fkey') THEN
    ALTER TABLE "PolicyDecision" ADD CONSTRAINT "PolicyDecision_policyId_fkey"
      FOREIGN KEY ("policyId") REFERENCES "ApprovalPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ─── Grants for new tables (app_user + admin_user created in 20260519000000) ─

GRANT SELECT, INSERT, UPDATE, DELETE ON "ManagedAgentTask"       TO app_user, admin_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentSdkSession"        TO app_user, admin_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "WebhookDeadLetter"      TO app_user, admin_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "CompanyMission"         TO app_user, admin_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Goal"                   TO app_user, admin_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentGoalLink"          TO app_user, admin_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "HeartbeatConfig"        TO app_user, admin_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "HeartbeatContext"       TO app_user, admin_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "HeartbeatRun"           TO app_user, admin_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Department"             TO app_user, admin_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentPermissionGrant"   TO app_user, admin_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentBudget"            TO app_user, admin_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "CostEvent"              TO app_user, admin_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "BudgetAlert"            TO app_user, admin_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ModelPerformanceStat"   TO app_user, admin_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Template"               TO app_user, admin_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ApprovalPolicy"         TO app_user, admin_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PolicyDecision"         TO app_user, admin_user;
