"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Copy, Check } from "lucide-react";
import { StatusBadge } from "./status-badge";
import type { SomaReviewPost } from "@/generated/prisma";
import type { Prisma } from "@/generated/prisma";

type PostWithBatch = SomaReviewPost;

interface PostCardProps {
  post: PostWithBatch;
}

function extractFullPostText(platform: string, fullPost: Prisma.JsonValue): string {
  if (typeof fullPost === "string") return fullPost;
  if (!fullPost || typeof fullPost !== "object" || Array.isArray(fullPost)) return "";
  const obj = fullPost as Record<string, unknown>;
  switch (platform) {
    case "LinkedIn": return typeof obj.text === "string" ? obj.text : "";
    case "X": return typeof obj.text === "string" ? obj.text : "";
    case "Instagram": return typeof obj.caption === "string" ? obj.caption : "";
    case "TikTok":
      return typeof obj.spoken_body === "string"
        ? obj.spoken_body
        : typeof obj.overlay === "string"
        ? obj.overlay
        : "";
    case "YouTube": return typeof obj.description === "string" ? obj.description : "";
    default: return JSON.stringify(fullPost, null, 2);
  }
}

function FullPostContent({ platform, fullPost }: { platform: string; fullPost: Prisma.JsonValue }): React.ReactElement {
  if (typeof fullPost === "string") {
    return <p className="text-xs text-muted-foreground whitespace-pre-wrap">{fullPost}</p>;
  }
  if (!fullPost || typeof fullPost !== "object" || Array.isArray(fullPost)) {
    return <p className="text-xs text-muted-foreground italic">No content</p>;
  }
  const obj = fullPost as Record<string, unknown>;

  if (platform === "LinkedIn" || platform === "X") {
    return (
      <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
        {typeof obj.text === "string" ? obj.text : ""}
      </p>
    );
  }

  if (platform === "Instagram") {
    return (
      <div className="space-y-2 text-xs text-muted-foreground">
        {typeof obj.slide_1 === "string" && (
          <div>
            <span className="text-foreground/50 uppercase tracking-wide text-[10px]">Cover slide</span>
            <p className="mt-0.5">{obj.slide_1}</p>
          </div>
        )}
        {Array.isArray(obj.slides_2_4) && (
          <div>
            <span className="text-foreground/50 uppercase tracking-wide text-[10px]">Content slides</span>
            <ol className="mt-0.5 list-decimal list-inside space-y-0.5">
              {obj.slides_2_4.map((s, i) => (
                <li key={i}>{String(s)}</li>
              ))}
            </ol>
          </div>
        )}
        {typeof obj.slide_cta === "string" && (
          <div>
            <span className="text-foreground/50 uppercase tracking-wide text-[10px]">CTA</span>
            <p className="mt-0.5 italic">{obj.slide_cta}</p>
          </div>
        )}
        {typeof obj.caption === "string" && (
          <div>
            <span className="text-foreground/50 uppercase tracking-wide text-[10px]">Caption</span>
            <p className="mt-0.5 whitespace-pre-wrap">{obj.caption}</p>
          </div>
        )}
      </div>
    );
  }

  if (platform === "TikTok") {
    return (
      <div className="space-y-2 text-xs text-muted-foreground">
        {typeof obj.overlay === "string" && (
          <div>
            <span className="text-foreground/50 uppercase tracking-wide text-[10px]">Overlay text</span>
            <p className="mt-0.5 font-medium">{obj.overlay}</p>
          </div>
        )}
        {Array.isArray(obj.screen_text) && (
          <div>
            <span className="text-foreground/50 uppercase tracking-wide text-[10px]">Screen text</span>
            <ol className="mt-0.5 list-decimal list-inside space-y-0.5">
              {obj.screen_text.map((s, i) => (
                <li key={i}>{String(s)}</li>
              ))}
            </ol>
          </div>
        )}
        {typeof obj.spoken_body === "string" && (
          <div>
            <span className="text-foreground/50 uppercase tracking-wide text-[10px]">Spoken script</span>
            <p className="mt-0.5 whitespace-pre-wrap leading-relaxed">{obj.spoken_body}</p>
          </div>
        )}
        {typeof obj.cta === "string" && (
          <p className="italic">{obj.cta}</p>
        )}
      </div>
    );
  }

  if (platform === "YouTube") {
    return (
      <div className="space-y-2 text-xs text-muted-foreground">
        {typeof obj.title === "string" && (
          <div>
            <span className="text-foreground/50 uppercase tracking-wide text-[10px]">Title</span>
            <p className="mt-0.5 font-medium">{obj.title}</p>
          </div>
        )}
        {typeof obj.script_opener === "string" && (
          <div>
            <span className="text-foreground/50 uppercase tracking-wide text-[10px]">Opening script</span>
            <p className="mt-0.5 whitespace-pre-wrap leading-relaxed">{obj.script_opener}</p>
          </div>
        )}
        {typeof obj.description === "string" && (
          <div>
            <span className="text-foreground/50 uppercase tracking-wide text-[10px]">Description</span>
            <p className="mt-0.5 whitespace-pre-wrap leading-relaxed">{obj.description}</p>
          </div>
        )}
        {Array.isArray(obj.tags) && obj.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {obj.tags.map((tag, i) => (
              <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0">
                {String(tag)}
              </Badge>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <pre className="text-xs text-muted-foreground whitespace-pre-wrap overflow-auto">
      {JSON.stringify(fullPost, null, 2)}
    </pre>
  );
}

function CopyButton({ text, label }: { text: string; label: string }): React.ReactElement {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (): Promise<void> => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      disabled={!text}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
    >
      {copied ? <Check className="size-3 text-green-400" /> : <Copy className="size-3" />}
      {copied ? "Copied" : label}
    </button>
  );
}

export function PostCard({ post }: PostCardProps): React.ReactElement {
  const fullPostText = extractFullPostText(post.platform, post.fullPost);

  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{post.platform}</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
              {post.patternId}
            </Badge>
            {post.charCount > 0 && (
              <span className="text-[10px] text-muted-foreground">{post.charCount} chars</span>
            )}
          </div>
          <StatusBadge status={post.status} />
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wide text-foreground/50">Hook</span>
            <CopyButton text={post.hookText} label="Copy hook" />
          </div>
          <p className="text-sm text-foreground/80 leading-snug">{post.hookText}</p>
        </div>

        {post.hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {post.hashtags.map((tag, i) => (
              <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wide text-foreground/50">Full post</span>
            <CopyButton text={fullPostText} label="Copy post" />
          </div>
          <div className="rounded-md bg-muted/30 p-3">
            <FullPostContent platform={post.platform} fullPost={post.fullPost} />
          </div>
        </div>

        {post.reviewNote && (
          <div className="rounded-md border border-yellow-500/20 bg-yellow-500/5 px-3 py-2">
            <p className="text-xs text-yellow-400">{post.reviewNote}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
