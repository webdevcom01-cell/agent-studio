import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma";

type LinkedInPost = string;
type XPost = string;
type YouTubePost = { title: string; description: string; tags?: string[] };
type InstagramPost = { caption: string; hashtags?: string[]; alt_text?: string };
type TikTokPost = { overlay: string; voice_over?: string; hashtags?: string[] };
type FullPost = LinkedInPost | XPost | YouTubePost | InstagramPost | TikTokPost;

interface QualityFlag {
  rule: string;
  detail?: string;
  severity?: string;
}

interface CrPost {
  platform: string;
  hook_text: string;
  pattern_id: string;
  full_post: FullPost;
  char_count?: number;
  hashtags?: string[];
  quality_flags?: QualityFlag[];
}

interface CrTrendContext {
  title?: string;
  source_url?: string;
  date_observed?: string;
  is_evergreen?: boolean;
}

interface CrPayload {
  review_batch_id: string;
  posts: CrPost[];
  trend_context?: CrTrendContext;
  angle_used?: string;
  [key: string]: unknown;
}

function isCrPayload(value: unknown): value is CrPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.posts) &&
    (v.posts as unknown[]).length > 0
  );
}

export async function trySaveCrPayload(
  output: unknown,
  userId: string | null,
): Promise<void> {
  let candidate: unknown = output;
  if (typeof output === "string") {
    try {
      candidate = JSON.parse(output);
    } catch {
      return;
    }
  }
  if (!isCrPayload(candidate)) return;

  const reviewBatchId = `review_${new Date().toISOString()}`;
  const tc = candidate.trend_context ?? {};

  await prisma.somaReviewBatch.create({
    data: {
      reviewBatchId,
      trendTitle: tc.title ?? "Untitled",
      sourceUrl: tc.source_url ?? "",
      dateObserved: tc.date_observed ?? new Date().toISOString().slice(0, 10),
      isEvergreen: tc.is_evergreen ?? false,
      angleUsed: typeof candidate.angle_used === "string" ? candidate.angle_used : "",
      status: "PENDING",
      ...(userId ? { userId } : {}),
      posts: {
        create: (candidate.posts as CrPost[]).map((p) => ({
          platform: p.platform,
          hookText: p.hook_text,
          patternId: p.pattern_id,
          fullPost: typeof p.full_post === "string"
            ? { text: p.full_post }
            : p.full_post,
          charCount: p.char_count ?? 0,
          hashtags: p.hashtags ?? [],
          qualityFlags: (Array.isArray(p.quality_flags) ? p.quality_flags : []) as unknown as Prisma.InputJsonValue,
          status: "PENDING",
        })),
      },
    },
  });
}
