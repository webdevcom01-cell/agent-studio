-- Layer 1: Webhook-to-Pipeline Bridge
-- Adds webhook trigger fields to PipelineRun, signature provider fields to WebhookConfig,
-- and creates the PipelineTemplate model.

-- ─── PipelineRun additions ────────────────────────────────────────────────────

-- Idempotency key prevents duplicate pipeline runs for the same PR commit.
-- Format: "{provider}-{owner/repo}-{prNumber}-{headSha}"
ALTER TABLE "PipelineRun" ADD COLUMN "webhookIdempotencyKey" TEXT;
ALTER TABLE "PipelineRun" ADD COLUMN "webhookExecutionId" TEXT;
ALTER TABLE "PipelineRun" ADD COLUMN "triggerSource" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "PipelineRun" ADD COLUMN "triggerBranch" TEXT;
ALTER TABLE "PipelineRun" ADD COLUMN "triggerPrNumber" INTEGER;

-- Unique constraint ensures DB-level race condition protection
CREATE UNIQUE INDEX "PipelineRun_webhookIdempotencyKey_key" ON "PipelineRun"("webhookIdempotencyKey");

-- Index for filtering by trigger source in the UI
CREATE INDEX "PipelineRun_triggerSource_idx" ON "PipelineRun"("triggerSource");

-- ─── WebhookConfig additions ─────────────────────────────────────────────────

-- Which signature scheme this webhook uses: "standard" | "github" | "gitlab"
ALTER TABLE "WebhookConfig" ADD COLUMN "signatureProvider" TEXT NOT NULL DEFAULT 'standard';

-- When true, this webhook triggers SDLC pipelines (not conversational flows)
ALTER TABLE "WebhookConfig" ADD COLUMN "isPipelineTrigger" BOOLEAN NOT NULL DEFAULT false;

-- Index for efficiently finding pipeline-trigger webhooks
CREATE INDEX "WebhookConfig_agentId_isPipelineTrigger_idx" ON "WebhookConfig"("agentId", "isPipelineTrigger");

-- ─── PipelineTemplate model (new table) ──────────────────────────────────────

CREATE TABLE "PipelineTemplate" (
    "id"               TEXT NOT NULL,
    "slug"             TEXT NOT NULL,
    "name"             TEXT NOT NULL,
    "description"      TEXT,
    "category"         TEXT NOT NULL,
    "icon"             TEXT NOT NULL,
    "agentSlugs"       JSONB NOT NULL DEFAULT '[]',
    "webhookPreset"    TEXT,
    "webhookSettings"  JSONB NOT NULL DEFAULT '{}',
    "pipelineSteps"    JSONB NOT NULL DEFAULT '[]',
    "pipelineDefaults" JSONB NOT NULL DEFAULT '{}',
    "setupGuide"       TEXT,
    "isBuiltIn"        BOOLEAN NOT NULL DEFAULT false,
    "usageCount"       INTEGER NOT NULL DEFAULT 0,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineTemplate_pkey" PRIMARY KEY ("id")
);

-- Unique slug for URL-safe lookups
CREATE UNIQUE INDEX "PipelineTemplate_slug_key" ON "PipelineTemplate"("slug");

-- Indexes for UI browsing
CREATE INDEX "PipelineTemplate_category_idx" ON "PipelineTemplate"("category");
CREATE INDEX "PipelineTemplate_isBuiltIn_idx" ON "PipelineTemplate"("isBuiltIn");
