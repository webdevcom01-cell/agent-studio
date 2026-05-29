import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PostCard } from "../_components/post-card";
import { StatusBadge } from "../_components/status-badge";
import { ExternalLink, Leaf } from "lucide-react";

export const dynamic = "force-dynamic";

const PLATFORM_ORDER = ["LinkedIn", "X", "YouTube", "Instagram", "TikTok"];

async function assertAdmin(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const rawIds = process.env.ADMIN_USER_IDS;
  if (!rawIds) {
    if (process.env.NODE_ENV === "production") redirect("/");
    return;
  }
  const adminIds = rawIds.split(",").map((s) => s.trim()).filter(Boolean);
  if (!adminIds.includes(session.user.id)) redirect("/");
}

export default async function ReviewQueueDetailPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}): Promise<React.ReactElement> {
  await assertAdmin();

  const { batchId } = await params;

  const batch = await prisma.somaReviewBatch.findUnique({
    where: { id: batchId },
    include: { posts: { orderBy: { createdAt: "asc" } } },
  });

  if (!batch) notFound();

  const sortedPosts = [...batch.posts].sort(
    (a, b) => PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform),
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-8">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6">
            <Link
              href="/admin/review-queue"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Review Queue
            </Link>
          </div>

          <div className="mb-6">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h1 className="text-base font-semibold">{batch.trendTitle}</h1>
                  <StatusBadge status={batch.status} />
                  {batch.isEvergreen && (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                      <Leaf className="size-3" />
                      evergreen
                    </span>
                  )}
                </div>

                <a
                  href={batch.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
                >
                  <ExternalLink className="size-3" />
                  {batch.sourceUrl}
                </a>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>Date: {batch.dateObserved}</span>
                  <span>·</span>
                  <span>Created: {batch.createdAt.toLocaleDateString()}</span>
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-md bg-muted/30 px-3 py-2">
              <span className="text-[10px] uppercase tracking-wide text-foreground/50">Angle</span>
              <p className="text-sm text-muted-foreground mt-0.5">{batch.angleUsed}</p>
            </div>
          </div>

          <div className="space-y-4">
            {sortedPosts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}

            {sortedPosts.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No posts in this batch.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
