import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BatchCard } from "./_components/batch-card";
import { Inbox } from "lucide-react";

export const dynamic = "force-dynamic";

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

export default async function ReviewQueuePage(): Promise<React.ReactElement> {
  await assertAdmin();

  const batches = await prisma.somaReviewBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { _count: { select: { posts: true } } },
  });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-8">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-base font-semibold">Review Queue</h1>
              <p className="text-sm text-muted-foreground mt-1">
                SOMA pipeline output — last {batches.length} batches
              </p>
            </div>
            <Link
              href="/admin"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back to admin
            </Link>
          </div>

          {batches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Inbox className="size-8 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No review batches yet.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Run the SOMA pipeline to generate content.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {batches.map((batch) => (
                <BatchCard key={batch.id} batch={batch} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
