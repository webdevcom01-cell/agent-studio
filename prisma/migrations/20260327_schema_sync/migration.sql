-- Delta migration: sync schema from 0_init baseline to current state
-- This covers all models, enums, columns, and indexes added via db:push
-- after the initial 0_init migration.
--
-- IMPORTANT: On production, this migration must be marked as already applied
-- because the schema was synced via db:push. See README section below.

-- ============================================================================
-- 1. New Enums
-- ============================================================================

CREATE TYPE "CLIGenerationStatus" AS ENUM ('PENDING', 'ANALYZING', 'DESIGNING', 'IMPLEMENTING', 'TESTING', 'DOCUMENTING', 'PUBLISHING', 'COMPLETED', 'FAILED');
CREATE TYPE "EvalRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "EvalResultStatus" AS ENUM ('PENDING', 'PASSED', 'FAILED', 'ERROR', 'SKIPPED');
CREATE TYPE "ExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'TIMEOUT');
CREATE TYPE "AccessLevel" AS ENUM ('READ', 'EXECUTE', 'ADMIN');
CREATE TYPE "ScheduleType" AS ENUM ('CRON', 'INTERVAL', 'MANUAL');
CREATE TYPE "ScheduledExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');
CREATE TYPE "WebhookExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');
CREATE TYPE "TraceStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- ============================================================================
-- 2. Enum modifications (new values added to existing enums)
-- ============================================================================

ALTER TYPE "AnalyticsEventType" ADD VALUE IF NOT EXISTS 'TOOL_CALL';
ALTER TYPE "AnalyticsEventType" ADD VALUE IF NOT EXISTS 'AGENT_CALL';
ALTER TYPE "AnalyticsEventType" ADD VALUE IF NOT EXISTS 'ERROR';
ALTER TYPE "AnalyticsEventType" ADD VALUE IF NOT EXISTS 'FLOW_EXECUTION';
ALTER TYPE "AnalyticsEventType" ADD VALUE IF NOT EXISTS 'SCHEDULE_EXECUTION';

-- ============================================================================
-- 3. New columns on existing tables
-- ============================================================================

-- Agent: ECC + marketplace fields
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "eccEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Account: encryption migration flag
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "tokensEncrypted" BOOLEAN NOT NULL DEFAULT false;

-- KnowledgeBase: enterprise RAG pipeline config
ALTER TABLE "KnowledgeBase" ADD COLUMN IF NOT EXISTS "chunkingStrategy" JSONB;
ALTER TABLE "KnowledgeBase" ADD COLUMN IF NOT EXISTS "embeddingModel" TEXT NOT NULL DEFAULT 'text-embedding-3-small';
ALTER TABLE "KnowledgeBase" ADD COLUMN IF NOT EXISTS "embeddingDimension" INTEGER NOT NULL DEFAULT 1536;
ALTER TABLE "KnowledgeBase" ADD COLUMN IF NOT EXISTS "retrievalMode" TEXT NOT NULL DEFAULT 'hybrid';
ALTER TABLE "KnowledgeBase" ADD COLUMN IF NOT EXISTS "rerankingModel" TEXT NOT NULL DEFAULT 'llm-rubric';
ALTER TABLE "KnowledgeBase" ADD COLUMN IF NOT EXISTS "queryTransform" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "KnowledgeBase" ADD COLUMN IF NOT EXISTS "searchTopK" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "KnowledgeBase" ADD COLUMN IF NOT EXISTS "searchThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.25;
ALTER TABLE "KnowledgeBase" ADD COLUMN IF NOT EXISTS "hybridAlpha" DOUBLE PRECISION NOT NULL DEFAULT 0.7;
ALTER TABLE "KnowledgeBase" ADD COLUMN IF NOT EXISTS "maxChunks" INTEGER NOT NULL DEFAULT 500;
ALTER TABLE "KnowledgeBase" ADD COLUMN IF NOT EXISTS "contextOrdering" TEXT NOT NULL DEFAULT 'relevance';
ALTER TABLE "KnowledgeBase" ADD COLUMN IF NOT EXISTS "migrationStatus" TEXT;
ALTER TABLE "KnowledgeBase" ADD COLUMN IF NOT EXISTS "processingProgress" JSONB;
ALTER TABLE "KnowledgeBase" ADD COLUMN IF NOT EXISTS "contextualEnrichment" BOOLEAN NOT NULL DEFAULT false;

-- KBSource: enterprise ingest fields
ALTER TABLE "KBSource" ADD COLUMN IF NOT EXISTS "customMetadata" JSONB;
ALTER TABLE "KBSource" ADD COLUMN IF NOT EXISTS "language" TEXT;
ALTER TABLE "KBSource" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
ALTER TABLE "KBSource" ADD COLUMN IF NOT EXISTS "reingestionSchedule" TEXT;
ALTER TABLE "KBSource" ADD COLUMN IF NOT EXISTS "reingestionEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "KBSource" ADD COLUMN IF NOT EXISTS "lastIngestedAt" TIMESTAMP(3);
ALTER TABLE "KBSource" ADD COLUMN IF NOT EXISTS "contentHash" TEXT;
ALTER TABLE "KBSource" ADD COLUMN IF NOT EXISTS "processingProgress" JSONB;

-- KBChunk: deduplication + retrieval stats
ALTER TABLE "KBChunk" ADD COLUMN IF NOT EXISTS "contentHash" TEXT;
ALTER TABLE "KBChunk" ADD COLUMN IF NOT EXISTS "lastRetrievedAt" TIMESTAMP(3);
ALTER TABLE "KBChunk" ADD COLUMN IF NOT EXISTS "retrievalCount" INTEGER NOT NULL DEFAULT 0;

-- AnalyticsEvent: expanded metrics
ALTER TABLE "AnalyticsEvent" ADD COLUMN IF NOT EXISTS "model" TEXT;
ALTER TABLE "AnalyticsEvent" ADD COLUMN IF NOT EXISTS "inputTokens" INTEGER;
ALTER TABLE "AnalyticsEvent" ADD COLUMN IF NOT EXISTS "outputTokens" INTEGER;
ALTER TABLE "AnalyticsEvent" ADD COLUMN IF NOT EXISTS "totalTokens" INTEGER;
ALTER TABLE "AnalyticsEvent" ADD COLUMN IF NOT EXISTS "costUsd" DECIMAL(10, 6);
ALTER TABLE "AnalyticsEvent" ADD COLUMN IF NOT EXISTS "durationMs" INTEGER;
ALTER TABLE "AnalyticsEvent" ADD COLUMN IF NOT EXISTS "ttfbMs" INTEGER;
ALTER TABLE "AnalyticsEvent" ADD COLUMN IF NOT EXISTS "sessionId" TEXT;
ALTER TABLE "AnalyticsEvent" ADD COLUMN IF NOT EXISTS "conversationId" TEXT;

-- Message: citations + metadata
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "citations" JSONB;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

-- MCPServer: CLI bridge + enhanced config
ALTER TABLE "MCPServer" ADD COLUMN IF NOT EXISTS "serverType" TEXT NOT NULL DEFAULT 'external';
ALTER TABLE "MCPServer" ADD COLUMN IF NOT EXISTS "cliConfig" JSONB;
ALTER TABLE "MCPServer" ADD COLUMN IF NOT EXISTS "headers" JSONB;
ALTER TABLE "MCPServer" ADD COLUMN IF NOT EXISTS "enabled" BOOLEAN NOT NULL DEFAULT true;

-- AgentCard: public flag
ALTER TABLE "AgentCard" ADD COLUMN IF NOT EXISTS "isPublic" BOOLEAN NOT NULL DEFAULT false;

-- ============================================================================
-- 4. New tables
-- ============================================================================

-- Google Workspace OAuth
CREATE TABLE IF NOT EXISTS "GoogleOAuthToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "scopes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GoogleOAuthToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "GoogleOAuthToken_userId_email_key" ON "GoogleOAuthToken"("userId", "email");
CREATE INDEX IF NOT EXISTS "GoogleOAuthToken_userId_idx" ON "GoogleOAuthToken"("userId");
ALTER TABLE "GoogleOAuthToken" ADD CONSTRAINT "GoogleOAuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CLI Generation Pipeline
CREATE TABLE IF NOT EXISTS "CLIGeneration" (
    "id" TEXT NOT NULL,
    "applicationName" TEXT NOT NULL,
    "target" TEXT NOT NULL DEFAULT 'python',
    "status" "CLIGenerationStatus" NOT NULL DEFAULT 'PENDING',
    "currentPhase" INTEGER NOT NULL DEFAULT 0,
    "phases" JSONB NOT NULL DEFAULT '[]',
    "cliConfig" JSONB,
    "generatedFiles" JSONB,
    "errorMessage" TEXT,
    "userId" TEXT NOT NULL,
    "mcpServerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CLIGeneration_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CLIGeneration_userId_idx" ON "CLIGeneration"("userId");
CREATE INDEX IF NOT EXISTS "CLIGeneration_userId_status_idx" ON "CLIGeneration"("userId", "status");
CREATE INDEX IF NOT EXISTS "CLIGeneration_createdAt_idx" ON "CLIGeneration"("createdAt");
ALTER TABLE "CLIGeneration" ADD CONSTRAINT "CLIGeneration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CLIGeneration" ADD CONSTRAINT "CLIGeneration_mcpServerId_fkey" FOREIGN KEY ("mcpServerId") REFERENCES "MCPServer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Eval Suite
CREATE TABLE IF NOT EXISTS "EvalSuite" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "agentId" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "runOnDeploy" BOOLEAN NOT NULL DEFAULT false,
    "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
    "scheduleCron" TEXT,
    "lastScheduledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EvalSuite_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "EvalSuite_agentId_idx" ON "EvalSuite"("agentId");
CREATE INDEX IF NOT EXISTS "EvalSuite_agentId_runOnDeploy_idx" ON "EvalSuite"("agentId", "runOnDeploy");
CREATE INDEX IF NOT EXISTS "EvalSuite_scheduleEnabled_idx" ON "EvalSuite"("scheduleEnabled");
ALTER TABLE "EvalSuite" ADD CONSTRAINT "EvalSuite_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Eval Test Case
CREATE TABLE IF NOT EXISTS "EvalTestCase" (
    "id" TEXT NOT NULL,
    "suiteId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "assertions" JSONB NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EvalTestCase_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "EvalTestCase_suiteId_idx" ON "EvalTestCase"("suiteId");
ALTER TABLE "EvalTestCase" ADD CONSTRAINT "EvalTestCase_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "EvalSuite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Eval Run
CREATE TABLE IF NOT EXISTS "EvalRun" (
    "id" TEXT NOT NULL,
    "suiteId" TEXT NOT NULL,
    "status" "EvalRunStatus" NOT NULL DEFAULT 'PENDING',
    "totalCases" INTEGER NOT NULL DEFAULT 0,
    "passedCases" INTEGER NOT NULL DEFAULT 0,
    "failedCases" INTEGER NOT NULL DEFAULT 0,
    "score" DOUBLE PRECISION,
    "durationMs" INTEGER,
    "triggeredBy" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "comparisonRunId" TEXT,
    "flowVersionId" TEXT,
    "modelOverride" TEXT,
    CONSTRAINT "EvalRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "EvalRun_suiteId_idx" ON "EvalRun"("suiteId");
CREATE INDEX IF NOT EXISTS "EvalRun_suiteId_createdAt_idx" ON "EvalRun"("suiteId", "createdAt");
ALTER TABLE "EvalRun" ADD CONSTRAINT "EvalRun_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "EvalSuite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Eval Result
CREATE TABLE IF NOT EXISTS "EvalResult" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "testCaseId" TEXT NOT NULL,
    "status" "EvalResultStatus" NOT NULL DEFAULT 'PENDING',
    "agentOutput" TEXT,
    "assertions" JSONB,
    "score" DOUBLE PRECISION,
    "latencyMs" INTEGER,
    "tokensUsed" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvalResult_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "EvalResult_runId_idx" ON "EvalResult"("runId");
CREATE INDEX IF NOT EXISTS "EvalResult_testCaseId_idx" ON "EvalResult"("testCaseId");
ALTER TABLE "EvalResult" ADD CONSTRAINT "EvalResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "EvalRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvalResult" ADD CONSTRAINT "EvalResult_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "EvalTestCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Flow Schedule
CREATE TABLE IF NOT EXISTS "FlowSchedule" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "scheduleType" "ScheduleType" NOT NULL DEFAULT 'CRON',
    "cronExpression" TEXT,
    "intervalMinutes" INTEGER,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "label" TEXT,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "failureWebhookUrl" TEXT,
    "nodeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FlowSchedule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FlowSchedule_agentId_idx" ON "FlowSchedule"("agentId");
CREATE INDEX IF NOT EXISTS "FlowSchedule_enabled_nextRunAt_idx" ON "FlowSchedule"("enabled", "nextRunAt");
CREATE INDEX IF NOT EXISTS "FlowSchedule_agentId_enabled_idx" ON "FlowSchedule"("agentId", "enabled");
CREATE UNIQUE INDEX IF NOT EXISTS "FlowSchedule_agentId_nodeId_key" ON "FlowSchedule"("agentId", "nodeId");
ALTER TABLE "FlowSchedule" ADD CONSTRAINT "FlowSchedule_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Scheduled Execution
CREATE TABLE IF NOT EXISTS "ScheduledExecution" (
    "id" TEXT NOT NULL,
    "flowScheduleId" TEXT NOT NULL,
    "status" "ScheduledExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "tokenUsage" JSONB,
    "costUsd" DECIMAL(10, 6),
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScheduledExecution_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ScheduledExecution_idempotencyKey_key" ON "ScheduledExecution"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "ScheduledExecution_flowScheduleId_idx" ON "ScheduledExecution"("flowScheduleId");
CREATE INDEX IF NOT EXISTS "ScheduledExecution_flowScheduleId_createdAt_idx" ON "ScheduledExecution"("flowScheduleId", "createdAt");
CREATE INDEX IF NOT EXISTS "ScheduledExecution_status_idx" ON "ScheduledExecution"("status");
CREATE INDEX IF NOT EXISTS "ScheduledExecution_triggeredAt_idx" ON "ScheduledExecution"("triggeredAt");
ALTER TABLE "ScheduledExecution" ADD CONSTRAINT "ScheduledExecution_flowScheduleId_fkey" FOREIGN KEY ("flowScheduleId") REFERENCES "FlowSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Webhook Config
CREATE TABLE IF NOT EXISTS "WebhookConfig" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "secret" TEXT NOT NULL,
    "secretEncrypted" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "bodyMappings" JSONB NOT NULL DEFAULT '[]',
    "headerMappings" JSONB NOT NULL DEFAULT '[]',
    "eventFilters" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "nodeId" TEXT,
    "triggerCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastTriggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WebhookConfig_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WebhookConfig_agentId_idx" ON "WebhookConfig"("agentId");
CREATE INDEX IF NOT EXISTS "WebhookConfig_agentId_enabled_idx" ON "WebhookConfig"("agentId", "enabled");
CREATE UNIQUE INDEX IF NOT EXISTS "WebhookConfig_agentId_nodeId_key" ON "WebhookConfig"("agentId", "nodeId");
ALTER TABLE "WebhookConfig" ADD CONSTRAINT "WebhookConfig_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Webhook Execution
CREATE TABLE IF NOT EXISTS "WebhookExecution" (
    "id" TEXT NOT NULL,
    "webhookConfigId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "WebhookExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "sourceIp" TEXT,
    "eventType" TEXT,
    "conversationId" TEXT,
    "errorMessage" TEXT,
    "rawPayload" TEXT,
    "rawHeaders" JSONB,
    "isReplay" BOOLEAN NOT NULL DEFAULT false,
    "replayOf" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebhookExecution_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WebhookExecution_idempotencyKey_key" ON "WebhookExecution"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "WebhookExecution_webhookConfigId_idx" ON "WebhookExecution"("webhookConfigId");
CREATE INDEX IF NOT EXISTS "WebhookExecution_webhookConfigId_createdAt_idx" ON "WebhookExecution"("webhookConfigId", "createdAt");
CREATE INDEX IF NOT EXISTS "WebhookExecution_status_idx" ON "WebhookExecution"("status");
ALTER TABLE "WebhookExecution" ADD CONSTRAINT "WebhookExecution_webhookConfigId_fkey" FOREIGN KEY ("webhookConfigId") REFERENCES "WebhookConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ECC: Agent Execution
CREATE TABLE IF NOT EXISTS "AgentExecution" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "inputParams" JSONB,
    "outputResult" JSONB,
    "traceId" TEXT,
    "parentExecutionId" TEXT,
    "error" TEXT,
    "tokenUsage" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentExecution_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AgentExecution_agentId_status_idx" ON "AgentExecution"("agentId", "status");
CREATE INDEX IF NOT EXISTS "AgentExecution_traceId_idx" ON "AgentExecution"("traceId");
ALTER TABLE "AgentExecution" ADD CONSTRAINT "AgentExecution_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentExecution" ADD CONSTRAINT "AgentExecution_parentExecutionId_fkey" FOREIGN KEY ("parentExecutionId") REFERENCES "AgentExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ECC: Skill
CREATE TABLE IF NOT EXISTS "Skill" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "description" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "inputSchema" JSONB,
    "outputSchema" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" TEXT,
    "language" TEXT,
    "eccOrigin" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Skill_slug_key" ON "Skill"("slug");
CREATE INDEX IF NOT EXISTS "Skill_slug_idx" ON "Skill"("slug");
CREATE INDEX IF NOT EXISTS "Skill_language_idx" ON "Skill"("language");

-- ECC: Agent Skill Permission
CREATE TABLE IF NOT EXISTS "AgentSkillPermission" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "accessLevel" "AccessLevel" NOT NULL DEFAULT 'READ',
    CONSTRAINT "AgentSkillPermission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AgentSkillPermission_agentId_skillId_key" ON "AgentSkillPermission"("agentId", "skillId");
ALTER TABLE "AgentSkillPermission" ADD CONSTRAINT "AgentSkillPermission_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentSkillPermission" ADD CONSTRAINT "AgentSkillPermission_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ECC: Instinct
CREATE TABLE IF NOT EXISTS "Instinct" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "frequency" INTEGER NOT NULL DEFAULT 1,
    "origin" TEXT,
    "examples" JSONB,
    "agentId" TEXT NOT NULL,
    "promotedToSkillId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Instinct_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Instinct_agentId_confidence_idx" ON "Instinct"("agentId", "confidence");
ALTER TABLE "Instinct" ADD CONSTRAINT "Instinct_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Instinct" ADD CONSTRAINT "Instinct_promotedToSkillId_fkey" FOREIGN KEY ("promotedToSkillId") REFERENCES "Skill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ECC: Audit Log
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AuditLog_resourceType_resourceId_idx" ON "AuditLog"("resourceType", "resourceId");
CREATE INDEX IF NOT EXISTS "AuditLog_userId_timestamp_idx" ON "AuditLog"("userId", "timestamp");

-- Flow Trace (Visual Debugger)
CREATE TABLE IF NOT EXISTS "FlowTrace" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "conversationId" TEXT,
    "testInput" TEXT,
    "status" "TraceStatus" NOT NULL DEFAULT 'RUNNING',
    "totalDurationMs" INTEGER,
    "nodesExecuted" INTEGER,
    "nodesFailed" INTEGER,
    "executionPath" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "nodeTraces" JSONB NOT NULL,
    "edgeTraces" JSONB NOT NULL,
    "flowSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FlowTrace_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FlowTrace_agentId_createdAt_idx" ON "FlowTrace"("agentId", "createdAt");
ALTER TABLE "FlowTrace" ADD CONSTRAINT "FlowTrace_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- 5. New indexes on existing tables (added after 0_init)
-- ============================================================================

CREATE INDEX IF NOT EXISTS "Agent_userId_updatedAt_idx" ON "Agent"("userId", "updatedAt");
CREATE INDEX IF NOT EXISTS "KBSource_knowledgeBaseId_status_idx" ON "KBSource"("knowledgeBaseId", "status");
CREATE INDEX IF NOT EXISTS "KBChunk_contentHash_idx" ON "KBChunk"("contentHash");
CREATE INDEX IF NOT EXISTS "KBChunk_lastRetrievedAt_idx" ON "KBChunk"("lastRetrievedAt");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_type_createdAt_idx" ON "AnalyticsEvent"("type", "createdAt");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_sessionId_idx" ON "AnalyticsEvent"("sessionId");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_model_createdAt_idx" ON "AnalyticsEvent"("model", "createdAt");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_agentId_type_createdAt_idx" ON "AnalyticsEvent"("agentId", "type", "createdAt");
CREATE INDEX IF NOT EXISTS "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "FlowVersion_createdAt_idx" ON "FlowVersion"("createdAt");
CREATE INDEX IF NOT EXISTS "FlowDeployment_createdAt_idx" ON "FlowDeployment"("createdAt");
CREATE INDEX IF NOT EXISTS "AgentCallLog_createdAt_idx" ON "AgentCallLog"("createdAt");
