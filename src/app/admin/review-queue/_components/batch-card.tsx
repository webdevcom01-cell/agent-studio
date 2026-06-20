import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { ExternalLink, ChevronRight, Leaf } from "lucide-react";
import { StatusBadge } from "./status-badge";
import type { SomaReviewBatch } from "@/generated/prisma";

interface BatchCardProps {
  batch: SomaReviewBatch & { _count: { posts: number } };
}

function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function BatchCard({ batch }: BatchCardProps): React.ReactElement {
  const hostname = (() => {
    try {
      return new URL(batch.sourceUrl).hostname.replace("www.", "");
    } catch {
      return batch.sourceUrl;
    }
  })();

  return (
    <Card className="hover:bg-muted/10 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-medium text-sm truncate">{batch.trendTitle}</span>
              <StatusBadge status={batch.status} />
              {batch.isEvergreen && (
                <span className="inline-flex items-center gap-1 text-xs text-success">
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
              {hostname}
            </a>

            <p className="text-xs text-muted-foreground line-clamp-2">{batch.angleUsed}</p>

            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span>{batch._count.posts} posts</span>
              <span>·</span>
              <span>{batch.dateObserved}</span>
              <span>·</span>
              <span>{relativeTime(batch.createdAt)}</span>
            </div>
          </div>

          <Link
            href={`/admin/review-queue/${batch.id}`}
            className="shrink-0 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
          >
            View details
            <ChevronRight className="size-3.5" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
