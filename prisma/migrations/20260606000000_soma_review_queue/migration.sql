-- CreateEnum
CREATE TYPE "SomaBatchStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SomaPostStatus" AS ENUM ('PENDING', 'APPROVED', 'EDITED', 'REJECTED');

-- CreateTable
CREATE TABLE "SomaReviewBatch" (
    "id" TEXT NOT NULL,
    "reviewBatchId" TEXT NOT NULL,
    "trendTitle" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "dateObserved" TEXT NOT NULL,
    "isEvergreen" BOOLEAN NOT NULL DEFAULT false,
    "angleUsed" TEXT NOT NULL,
    "status" "SomaBatchStatus" NOT NULL DEFAULT 'PENDING',
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SomaReviewBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SomaReviewPost" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "hookText" TEXT NOT NULL,
    "patternId" TEXT NOT NULL,
    "fullPost" JSONB NOT NULL,
    "charCount" INTEGER NOT NULL DEFAULT 0,
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "SomaPostStatus" NOT NULL DEFAULT 'PENDING',
    "editedContent" JSONB,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SomaReviewPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SomaReviewBatch_reviewBatchId_key" ON "SomaReviewBatch"("reviewBatchId");

-- CreateIndex
CREATE INDEX "SomaReviewBatch_userId_status_idx" ON "SomaReviewBatch"("userId", "status");

-- CreateIndex
CREATE INDEX "SomaReviewBatch_status_idx" ON "SomaReviewBatch"("status");

-- CreateIndex
CREATE INDEX "SomaReviewBatch_createdAt_idx" ON "SomaReviewBatch"("createdAt");

-- CreateIndex
CREATE INDEX "SomaReviewPost_batchId_idx" ON "SomaReviewPost"("batchId");

-- CreateIndex
CREATE INDEX "SomaReviewPost_batchId_platform_idx" ON "SomaReviewPost"("batchId", "platform");

-- AddForeignKey
ALTER TABLE "SomaReviewBatch" ADD CONSTRAINT "SomaReviewBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SomaReviewPost" ADD CONSTRAINT "SomaReviewPost_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "SomaReviewBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
