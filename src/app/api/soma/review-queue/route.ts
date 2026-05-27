import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// ─── CR payload schema ───────────────────────────────────────────────────────

const TrendContextSchema = z.object({
  title: z.string(),
  source_url: z.string(),
  date_observed: z.string(),
  is_evergreen: z.boolean().default(false),
});

const PostSchema = z.object({
  platform: z.string(),
  hook_text: z.string(),
  pattern_id: z.string(),
  full_post: z.unknown(),
  char_count: z.number().int().default(0),
  hashtags: z.array(z.string()).default([]),
  status: z.string().default("READY_FOR_REVIEW"),
});

const CrPayloadSchema = z.object({
  review_batch_id: z.string(),
  trend_context: TrendContextSchema,
  angle_used: z.string(),
  posts: z.array(PostSchema).min(1),
});

// ─── GET /api/soma/review-queue ──────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  try {
    const batches = await prisma.somaReviewBatch.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { posts: true } },
        posts: {
          select: { status: true },
        },
      },
    });

    const shaped = batches.map((batch) => {
      const approvedCount = batch.posts.filter(
        (p) => p.status === "APPROVED" || p.status === "EDITED",
      ).length;
      return {
        id: batch.id,
        reviewBatchId: batch.reviewBatchId,
        trendTitle: batch.trendTitle,
        sourceUrl: batch.sourceUrl,
        dateObserved: batch.dateObserved,
        isEvergreen: batch.isEvergreen,
        angleUsed: batch.angleUsed,
        status: batch.status,
        postCount: batch._count.posts,
        approvedCount,
        createdAt: batch.createdAt,
        updatedAt: batch.updatedAt,
      };
    });

    return NextResponse.json({ batches: shaped });
  } catch (error) {
    logger.error("GET /api/soma/review-queue failed", { error });
    return NextResponse.json(
      { error: "Failed to fetch review queue" },
      { status: 500 },
    );
  }
}

// ─── POST /api/soma/review-queue ─────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CrPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid CR payload", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { review_batch_id, trend_context, angle_used, posts } = parsed.data;

  try {
    const batch = await prisma.somaReviewBatch.upsert({
      where: { reviewBatchId: review_batch_id },
      update: {
        trendTitle: trend_context.title,
        sourceUrl: trend_context.source_url,
        dateObserved: trend_context.date_observed,
        isEvergreen: trend_context.is_evergreen,
        angleUsed: angle_used,
        status: "PENDING",
        userId: auth.userId,
        posts: {
          deleteMany: {},
          create: posts.map((p) => ({
            platform: p.platform,
            hookText: p.hook_text,
            patternId: p.pattern_id,
            fullPost: p.full_post as object,
            charCount: p.char_count,
            hashtags: p.hashtags,
            status: "PENDING",
          })),
        },
      },
      create: {
        reviewBatchId: review_batch_id,
        trendTitle: trend_context.title,
        sourceUrl: trend_context.source_url,
        dateObserved: trend_context.date_observed,
        isEvergreen: trend_context.is_evergreen,
        angleUsed: angle_used,
        status: "PENDING",
        userId: auth.userId,
        posts: {
          create: posts.map((p) => ({
            platform: p.platform,
            hookText: p.hook_text,
            patternId: p.pattern_id,
            fullPost: p.full_post as object,
            charCount: p.char_count,
            hashtags: p.hashtags,
            status: "PENDING",
          })),
        },
      },
      include: { _count: { select: { posts: true } } },
    });

    return NextResponse.json({ batch }, { status: 201 });
  } catch (error) {
    logger.error("POST /api/soma/review-queue failed", { error, review_batch_id });
    return NextResponse.json(
      { error: "Failed to save review batch" },
      { status: 500 },
    );
  }
}
