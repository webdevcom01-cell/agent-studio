import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

interface RouteContext {
  params: Promise<{ batchId: string }>;
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const { batchId } = await context.params;

  try {
    const batch = await prisma.somaReviewBatch.findUnique({
      where: { id: batchId },
      include: {
        posts: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!batch) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }

    if (batch.userId !== auth.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ batch });
  } catch (error) {
    logger.error("GET /api/soma/review-queue/[batchId] failed", { error, batchId });
    return NextResponse.json({ error: "Failed to fetch batch" }, { status: 500 });
  }
}
