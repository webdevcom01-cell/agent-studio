"use client";

import React from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, ExternalLink, Leaf } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface BatchSummary {
  id: string;
  reviewBatchId: string;
  trendTitle: string;
  sourceUrl: string;
  dateObserved: string;
  isEvergreen: boolean;
  status: "PENDING" | "IN_REVIEW" | "APPROVED" | "REJECTED";
  postCount: number;
  approvedCount: number;
  createdAt: string;
}

interface QueueResponse {
  batches: BatchSummary[];
}

// ─── Utils ───────────────────────────────────────────────────────────────────

const fetcher = (url: string): Promise<QueueResponse> =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error("Failed to fetch");
    return r.json() as Promise<QueueResponse>;
  });

const STATUS_STYLES: Record<BatchSummary["status"], string> = {
  PENDING: "bg-muted text-muted-foreground",
  IN_REVIEW: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  APPROVED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  REJECTED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

// ─── Components ──────────────────────────────────────────────────────────────

function BatchCard({ batch }: { batch: BatchSummary }): React.ReactElement {
  const truncatedUrl = batch.sourceUrl.replace(/^https?:\/\//, "").slice(0, 50);

  return (
    <Link href={`/soma/review-queue/${batch.id}`} className="block group">
      <Card className="transition-colors hover:border-primary/40">
        <CardContent className="px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                {batch.trendTitle}
              </p>
              <div className="flex items-center gap-1 mt-0.5">
                <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
                <span className="text-xs text-muted-foreground truncate">{truncatedUrl}</span>
              </div>
            </div>
            <Badge
              className={cn("shrink-0 text-xs font-medium border-0", STATUS_STYLES[batch.status])}
            >
              {batch.status.replace("_", " ")}
            </Badge>
          </div>

          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            <Badge variant="outline" className="text-xs">
              {batch.dateObserved}
            </Badge>
            {batch.isEvergreen && (
              <Badge variant="outline" className="text-xs gap-1 text-green-600 border-green-300 dark:text-green-400 dark:border-green-700">
                <Leaf className="size-2.5" />
                Evergreen
              </Badge>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              {batch.approvedCount}/{batch.postCount} approved
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function SkeletonBatchCard(): React.ReactElement {
  return (
    <Card>
      <CardContent className="px-4 py-3 space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5 flex-1">
            <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
            <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
          </div>
          <div className="h-5 w-20 rounded-full bg-muted animate-pulse" />
        </div>
        <div className="flex gap-2">
          <div className="h-5 w-24 rounded-full bg-muted animate-pulse" />
          <div className="h-5 w-16 rounded-full bg-muted animate-pulse" />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SomaReviewQueuePage(): React.ReactElement {
  const { data, isLoading, error } = useSWR<QueueResponse>(
    "/api/soma/review-queue",
    fetcher,
    { refreshInterval: 10000 },
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-border px-3">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href="/">
            <ArrowLeft className="size-3.5" />
          </Link>
        </Button>
        <span className="text-sm font-medium">SOMA Review Queue</span>
        {data && (
          <Badge variant="secondary" className="text-xs">
            {data.batches.length}
          </Badge>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        {isLoading && (
          <div className="space-y-2 max-w-2xl">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBatchCard key={i} />
            ))}
          </div>
        )}

        {error && (
          <div className="text-sm text-destructive">Failed to load review queue.</div>
        )}

        {!isLoading && data && data.batches.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-sm text-muted-foreground">No review batches yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Run the TI agent to generate content.
            </p>
          </div>
        )}

        {!isLoading && data && data.batches.length > 0 && (
          <div className="space-y-2 max-w-2xl">
            {data.batches.map((batch) => (
              <BatchCard key={batch.id} batch={batch} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
