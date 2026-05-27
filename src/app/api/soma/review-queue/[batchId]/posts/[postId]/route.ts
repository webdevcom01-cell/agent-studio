import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { SomaBatchStatus } from "@/generated/prisma";

const PatchPostSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "EDITED"]),
  editedContent: z.unknown().optional(),
  reviewNote: z.string().max(2000).optional(),
});

interface RouteContext {
  params: Promise<{ batchId: string; postId: string }>;
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const { batchId, postId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = PatchPostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { status, editedContent, reviewNote } = parsed.data;

  try {
    const batch = await prisma.somaReviewBatch.findUnique({
      where: { id: batchId },
      select: { userId: true },
    });

    if (!batch) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }

    if (batch.userId !== auth.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const post = await prisma.somaReviewPost.update({
      where: { id: postId, batchId },
      data: {
        status,
        reviewedAt: new Date(),
        ...(editedContent !== undefined && { editedContent: editedContent as object }),
        ...(reviewNote !== undefined && { reviewNote }),
      },
    });

    const batchNewStatus = await computeBatchStatus(batchId);
    await prisma.somaReviewBatch.update({
      where: { id: batchId },
      data: { status: batchNewStatus },
    });

    return NextResponse.json({ post, batchStatus: batchNewStatus });
  } catch (error) {
    logger.error("PATCH /api/soma/review-queue/[batchId]/posts/[postId] failed", {
      error,
      batchId,
      postId,
    });
    return NextResponse.json({ error: "Failed to update post" }, { status: 500 });
  }
}

async function computeBatchStatus(batchId: string): Promise<SomaBatchStatus> {
  const posts = await prisma.somaReviewPost.findMany({
    where: { batchId },
    select: { status: true },
  });

  const allReviewed = posts.every((p) => p.status !== "PENDING");
  if (!allReviewed) return "IN_REVIEW";

  const hasRejected = posts.some((p) => p.status === "REJECTED");
  if (hasRejected) return "REJECTED";

  return "APPROVED";
}
