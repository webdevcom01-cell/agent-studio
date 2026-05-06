-- AlterTable: add modelId, useSmartRouting, requireApproval to PipelineRun
ALTER TABLE "PipelineRun" ADD COLUMN "modelId" TEXT;
ALTER TABLE "PipelineRun" ADD COLUMN "useSmartRouting" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PipelineRun" ADD COLUMN "requireApproval" BOOLEAN NOT NULL DEFAULT false;
