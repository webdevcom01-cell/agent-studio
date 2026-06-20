"use client";

import React, { useState, use } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, Check, X, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type PostStatus = "PENDING" | "APPROVED" | "EDITED" | "REJECTED";
type BatchStatus = "PENDING" | "IN_REVIEW" | "APPROVED" | "REJECTED";

interface QualityFlag {
  rule: string;
  detail?: string;
  severity?: string;
}

interface ReviewPost {
  id: string;
  platform: string;
  hookText: string;
  patternId: string;
  fullPost: unknown;
  charCount: number;
  hashtags: string[];
  status: PostStatus;
  editedContent: unknown;
  reviewNote: string | null;
  qualityFlags?: QualityFlag[];
}

interface ReviewBatch {
  id: string;
  reviewBatchId: string;
  trendTitle: string;
  sourceUrl: string;
  dateObserved: string;
  isEvergreen: boolean;
  angleUsed: string;
  status: BatchStatus;
  posts: ReviewPost[];
}

// ─── Utils ───────────────────────────────────────────────────────────────────

const fetcher = (url: string): Promise<{ batch: ReviewBatch }> =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error("Failed to fetch");
    return r.json() as Promise<{ batch: ReviewBatch }>;
  });

const PLATFORM_STYLES: Record<string, string> = {
  LinkedIn: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  X: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  YouTube: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Instagram: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  TikTok: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

const PLATFORM_ABBR: Record<string, string> = {
  LinkedIn: "LI",
  X: "X",
  YouTube: "YT",
  Instagram: "IG",
  TikTok: "TT",
};

const POST_STATUS_STYLES: Record<PostStatus, string> = {
  PENDING: "bg-muted text-muted-foreground",
  APPROVED: "bg-success/10 text-success border-success/20",
  EDITED: "bg-primary/10 text-primary border-primary/20",
  REJECTED: "bg-destructive/10 text-destructive border-destructive/20",
};

async function patchPost(
  batchId: string,
  postId: string,
  payload: { status: "APPROVED" | "REJECTED" | "EDITED"; editedContent?: unknown; reviewNote?: string },
): Promise<void> {
  const res = await fetch(`/api/soma/review-queue/${batchId}/posts/${postId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Update failed");
}

// ─── FullPost renderer ───────────────────────────────────────────────────────

function StructuredField({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-xs text-foreground/80 whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function FullPostContent({ platform, fullPost }: { platform: string; fullPost: unknown }): React.ReactElement {
  if (platform === "LinkedIn" || platform === "X") {
    return (
      <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">
        {typeof fullPost === "string" ? fullPost : JSON.stringify(fullPost, null, 2)}
      </p>
    );
  }

  if (platform === "YouTube" && fullPost && typeof fullPost === "object") {
    const yt = fullPost as Record<string, unknown>;
    return (
      <div className="space-y-2">
        {Boolean(yt.title) && <StructuredField label="Title" value={String(yt.title)} />}
        {Boolean(yt.description) && <StructuredField label="Description" value={String(yt.description)} />}
        {Boolean(yt.script_opener) && <StructuredField label="Script opener" value={String(yt.script_opener)} />}
        {Array.isArray(yt.tags) && (
          <StructuredField label="Tags" value={(yt.tags as string[]).join(", ")} />
        )}
      </div>
    );
  }

  if (platform === "Instagram" && fullPost && typeof fullPost === "object") {
    const ig = fullPost as Record<string, unknown>;
    return (
      <div className="space-y-2">
        {Boolean(ig.slide_1) && <StructuredField label="Slide 1" value={String(ig.slide_1)} />}
        {Array.isArray(ig.slides_2_4) && (
          <StructuredField label="Slides 2–4" value={(ig.slides_2_4 as string[]).join("\n")} />
        )}
        {Boolean(ig.slide_cta) && <StructuredField label="CTA slide" value={String(ig.slide_cta)} />}
        {Boolean(ig.caption) && <StructuredField label="Caption" value={String(ig.caption)} />}
      </div>
    );
  }

  if (platform === "TikTok" && fullPost && typeof fullPost === "object") {
    const tt = fullPost as Record<string, unknown>;
    return (
      <div className="space-y-2">
        {Boolean(tt.overlay) && <StructuredField label="Overlay" value={String(tt.overlay)} />}
        {Boolean(tt.spoken_body) && <StructuredField label="Spoken body" value={String(tt.spoken_body)} />}
        {Array.isArray(tt.screen_text) && (
          <StructuredField label="Screen text" value={(tt.screen_text as string[]).join("\n")} />
        )}
        {Boolean(tt.cta) && <StructuredField label="CTA" value={String(tt.cta)} />}
      </div>
    );
  }

  return (
    <pre className="text-xs text-foreground/70 whitespace-pre-wrap break-words">
      {JSON.stringify(fullPost, null, 2)}
    </pre>
  );
}

// ─── PostCard ────────────────────────────────────────────────────────────────

function PostCard({
  post,
  batchId,
  onUpdated,
}: {
  post: ReviewPost;
  batchId: string;
  onUpdated: () => void;
}): React.ReactElement {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editValue, setEditValue] = useState(
    typeof post.fullPost === "string" ? post.fullPost : JSON.stringify(post.fullPost, null, 2),
  );
  const [isSaving, setIsSaving] = useState(false);

  async function handleAction(status: "APPROVED" | "REJECTED"): Promise<void> {
    try {
      await patchPost(batchId, post.id, { status });
      onUpdated();
    } catch {
      // surface via onUpdated refetch
    }
  }

  async function handleSaveEdit(): Promise<void> {
    setIsSaving(true);
    try {
      let parsed: unknown = editValue;
      try { parsed = JSON.parse(editValue); } catch { parsed = editValue; }
      await patchPost(batchId, post.id, { status: "EDITED", editedContent: parsed });
      setIsEditOpen(false);
      onUpdated();
    } catch {
      // leave dialog open
    } finally {
      setIsSaving(false);
    }
  }

  const isDone = post.status !== "PENDING";

  return (
    <>
      <Card className={cn(isDone && "opacity-80")}>
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded-md text-xs font-bold",
                  PLATFORM_STYLES[post.platform] ?? "bg-muted text-muted-foreground",
                )}
              >
                {PLATFORM_ABBR[post.platform] ?? post.platform.slice(0, 2).toUpperCase()}
              </span>
              <CardTitle className="text-sm">{post.platform}</CardTitle>
              <Badge variant="outline" className="text-[10px]">{post.patternId}</Badge>
              {Array.isArray(post.qualityFlags) && post.qualityFlags.length > 0 && (
                <Badge
                  variant="outline"
                  className="text-[10px] border-warning text-warning"
                  title={post.qualityFlags.map((f) => `${f.rule}: ${f.detail ?? ""}`).join("\n")}
                >
                  ⚠ {post.qualityFlags.length}
                </Badge>
              )}
            </div>
            <Badge
              className={cn("text-[10px] border-0", POST_STATUS_STYLES[post.status])}
            >
              {post.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-3">
          <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-primary mb-1">Hook</p>
            <p className="text-xs font-medium">{post.hookText}</p>
          </div>

          <div className="rounded-md bg-muted/50 px-3 py-2 max-h-48 overflow-y-auto">
            <FullPostContent platform={post.platform} fullPost={post.fullPost} />
          </div>

          {post.charCount > 0 && (
            <p className="text-[10px] text-muted-foreground">{post.charCount} chars</p>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              className="h-7 text-xs gap-1 bg-success hover:bg-success/90 text-white"
              onClick={() => handleAction("APPROVED")}
              disabled={isDone}
            >
              <Check className="size-3" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1 border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => handleAction("REJECTED")}
              disabled={isDone}
            >
              <X className="size-3" />
              Reject
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={() => setIsEditOpen(true)}
              disabled={isDone}
            >
              <Pencil className="size-3" />
              Edit
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit {post.platform} post</DialogTitle>
          </DialogHeader>
          <Textarea
            className="font-mono text-xs min-h-48"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
          />
          <DialogFooter showCloseButton>
            <Button size="sm" onClick={handleSaveEdit} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save & approve edit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function BatchDetailPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}): React.ReactElement {
  const { batchId } = use(params);
  const batchKey = `/api/soma/review-queue/${batchId}`;
  const { data, isLoading, error, mutate } = useSWR<{ batch: ReviewBatch }>(
    batchKey,
    fetcher,
    { refreshInterval: 10000 },
  );

  const batch = data?.batch;

  async function handleApproveAll(): Promise<void> {
    if (!batch) return;
    const pending = batch.posts.filter((p) => p.status === "PENDING");
    await Promise.allSettled(
      pending.map((p) => patchPost(batchId, p.id, { status: "APPROVED" })),
    );
    await mutate();
  }

  function handleUpdated(): void {
    void mutate();
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-border px-3">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href="/soma/review-queue">
            <ArrowLeft className="size-3.5" />
          </Link>
        </Button>
        <span className="text-sm font-medium truncate">
          {batch?.trendTitle ?? "Review Batch"}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-48 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive">Failed to load batch.</p>
        )}

        {!isLoading && !batch && !error && (
          <p className="text-sm text-muted-foreground">Batch not found.</p>
        )}

        {batch && (
          <>
            <div className="rounded-lg border bg-card px-4 py-3 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Angle</p>
                  <p className="text-sm">{batch.angleUsed}</p>
                </div>
                <Button
                  size="sm"
                  className="shrink-0 h-7 text-xs bg-success hover:bg-success/90 text-white"
                  onClick={handleApproveAll}
                  disabled={batch.posts.every((p) => p.status !== "PENDING")}
                >
                  <Check className="size-3 mr-1" />
                  Approve all
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground font-mono">{batch.reviewBatchId}</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {batch.posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  batchId={batchId}
                  onUpdated={handleUpdated}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
